import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import type { CaseView } from "../src/types.js";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(openDatabase(":memory:"));
});

async function add(...ids: number[]): Promise<CaseView> {
  let body: CaseView | undefined;
  for (const alertId of ids) {
    const res = await request(app).post("/api/case/alerts").send({ alertId }).expect(201);
    body = res.body;
  }
  return body!;
}

describe("alerts", () => {
  it("lists the seeded alerts", async () => {
    const res = await request(app).get("/api/alerts").expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(8);
    expect(new Set(res.body.map((a: { category: string }) => a.category)).size).toBeGreaterThanOrEqual(3);
    for (const a of res.body) expect(a.baseScore).toBeGreaterThanOrEqual(1);
  });
});

describe("case management", () => {
  it("starts empty", async () => {
    const res = await request(app).get("/api/case").expect(200);
    expect(res.body).toMatchObject({ alerts: [], policies: [], summary: { finalScore: 0, severity: "Low" } });
  });

  it("adds and removes alerts and rescores", async () => {
    const afterAdd = await add(3, 4); // 34 + 40
    expect(afterAdd.summary).toMatchObject({ rawScore: 74, finalScore: 74, severity: "High" });

    const res = await request(app).delete("/api/case/alerts/4").expect(200);
    expect(res.body.alerts.map((a: { id: number }) => a.id)).toEqual([3]);
    expect(res.body.summary.finalScore).toBe(34);
  });

  it("rejects duplicate, unknown and malformed alert ids", async () => {
    await add(1);
    await request(app).post("/api/case/alerts").send({ alertId: 1 }).expect(409);
    await request(app).post("/api/case/alerts").send({ alertId: 999 }).expect(404);
    await request(app).post("/api/case/alerts").send({ alertId: "abc" }).expect(400);
    await request(app).delete("/api/case/alerts/2").expect(404);
  });

  it("clears the case", async () => {
    await add(1, 2);
    await request(app).put("/api/case/policies").send({ policies: "APT_CAMPAIGN_LINK" }).expect(200);
    const res = await request(app).delete("/api/case").expect(200);
    expect(res.body).toMatchObject({ alerts: [], policies: [] });
  });
});

describe("policies", () => {
  it("applies damping + boost and reports adjustments", async () => {
    await add(5, 6, 7, 8, 9); // scans 12+15+8+22, lsass 38 -> raw 95
    const res = await request(app)
      .put("/api/case/policies")
      .send({ policies: "repeat_noise_damping, critical_asset_boost" })
      .expect(200);
    const s = res.body.summary;
    expect(res.body.policies).toEqual(["REPEAT_NOISE_DAMPING", "CRITICAL_ASSET_BOOST"]);
    expect(s.rawScore).toBe(95);
    expect(s.adjustments[0]).toMatchObject({ policy: "REPEAT_NOISE_DAMPING", points: -35 }); // keeps 22
    expect(s.adjustments[1]).toMatchObject({ policy: "CRITICAL_ASSET_BOOST", scoreBefore: 60, points: 12 });
    expect(s.finalScore).toBe(72);
    expect(s.ignoredAlertIds.sort()).toEqual([5, 6, 7]);
  });

  it("rejects conflicting and unknown policies without changing the case", async () => {
    await request(app).put("/api/case/policies").send({ policies: "APT_CAMPAIGN_LINK" }).expect(200);
    const bad = await request(app)
      .put("/api/case/policies")
      .send({ policies: ["CRITICAL_ASSET_BOOST", "APT_CAMPAIGN_LINK"] })
      .expect(400);
    expect(bad.body.error).toMatch(/Only one escalation/);
    await request(app).put("/api/case/policies").send({ policies: "NOPE" }).expect(400);
    await request(app).put("/api/case/policies").send({}).expect(400);

    const res = await request(app).get("/api/case").expect(200);
    expect(res.body.policies).toEqual(["APT_CAMPAIGN_LINK"]);
  });

  it("keeps the summary correct when the case stops qualifying for a policy", async () => {
    await add(3, 9); // 34 + 38 = 72
    const applied = await request(app).put("/api/case/policies").send({ policies: "APT_CAMPAIGN_LINK" });
    expect(applied.body.summary).toMatchObject({ finalScore: 97, severity: "Critical" });

    const removed = await request(app).delete("/api/case/alerts/9").expect(200); // 34 < 50
    expect(removed.body.policies).toEqual(["APT_CAMPAIGN_LINK"]); // selection is kept...
    expect(removed.body.summary.adjustments[0]).toMatchObject({ applied: false, points: 0 }); // ...but not applied
    expect(removed.body.summary).toMatchObject({ finalScore: 34, severity: "Medium" });

    // and it re-qualifies automatically when the case grows again
    const readded = await add(4); // 34 + 40 = 74
    expect(readded.summary.finalScore).toBe(99);
  });

  it("summary endpoint matches the case view", async () => {
    await add(1, 2, 3);
    const c = await request(app).get("/api/case");
    const s = await request(app).get("/api/case/summary");
    expect(s.body).toEqual(c.body.summary);
  });
});

it("returns JSON 404 for unknown API routes and 400 for bad JSON", async () => {
  await request(app).get("/api/nope").expect(404);
  await request(app)
    .put("/api/case/policies")
    .set("Content-Type", "application/json")
    .send("{bad json")
    .expect(400);
});
