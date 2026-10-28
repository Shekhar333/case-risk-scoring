import { describe, expect, it } from "vitest";
import { parsePolicies, PolicyValidationError, scoreCase, severityFor } from "../src/scoring.js";
import type { Alert, Category } from "../src/types.js";

let nextId = 1;
function alert(category: Category, baseScore: number): Alert {
  const id = nextId++;
  return { id, title: `alert-${id}`, category, sourceHost: "host", baseScore };
}

describe("raw score and severity", () => {
  it("empty case scores 0 / Low", () => {
    const s = scoreCase([], []);
    expect(s).toMatchObject({ rawScore: 0, finalScore: 0, severity: "Low", adjustments: [] });
  });

  it("raw score is the sum of base scores", () => {
    const s = scoreCase([alert("phishing", 10), alert("malware", 25)], []);
    expect(s.rawScore).toBe(35);
    expect(s.finalScore).toBe(35);
    expect(s.severity).toBe("Medium");
  });

  it("final score is capped at 100 even with no policies", () => {
    const s = scoreCase([alert("malware", 40), alert("malware", 40), alert("malware", 40)], []);
    expect(s.rawScore).toBe(120);
    expect(s.uncappedScore).toBe(120);
    expect(s.finalScore).toBe(100);
    expect(s.capped).toBe(true);
    expect(s.severity).toBe("Critical");
  });

  it.each([
    [0, "Low"],
    [29, "Low"],
    [30, "Medium"],
    [59, "Medium"],
    [60, "High"],
    [84, "High"],
    [85, "Critical"],
    [100, "Critical"],
  ])("score %i is %s", (score, band) => {
    expect(severityFor(score)).toBe(band);
  });
});

describe("REPEAT_NOISE_DAMPING", () => {
  it("keeps only the highest network_scan alert", () => {
    const top = alert("network_scan", 15);
    const low1 = alert("network_scan", 8);
    const low2 = alert("network_scan", 12);
    const s = scoreCase([top, low1, low2, alert("phishing", 20)], ["REPEAT_NOISE_DAMPING"]);
    expect(s.rawScore).toBe(55);
    expect(s.finalScore).toBe(35);
    expect(s.adjustments[0]).toMatchObject({ applied: true, points: -20 });
    expect(s.ignoredAlertIds.sort()).toEqual([low1.id, low2.id].sort());
  });

  it("does nothing with a single network_scan alert", () => {
    const s = scoreCase([alert("network_scan", 15), alert("malware", 20)], ["REPEAT_NOISE_DAMPING"]);
    expect(s.finalScore).toBe(35);
    expect(s.adjustments[0]).toMatchObject({ applied: false, points: 0 });
  });

  it("keeps exactly one alert when network_scan scores tie", () => {
    const s = scoreCase([alert("network_scan", 10), alert("network_scan", 10)], ["REPEAT_NOISE_DAMPING"]);
    expect(s.finalScore).toBe(10);
    expect(s.ignoredAlertIds).toHaveLength(1);
  });
});

describe("CRITICAL_ASSET_BOOST", () => {
  it("adds 20%, rounded down", () => {
    const s = scoreCase([alert("malware", 37)], ["CRITICAL_ASSET_BOOST"]);
    expect(s.adjustments[0]).toMatchObject({ applied: true, points: 7 }); // 7.4 -> 7
    expect(s.finalScore).toBe(44);
  });

  it("rounds down exactly where float math would drift (15 * 0.2)", () => {
    const s = scoreCase([alert("malware", 15)], ["CRITICAL_ASSET_BOOST"]);
    expect(s.adjustments[0].points).toBe(3);
  });

  it("caps the boost at 30 points", () => {
    const alerts = [40, 40, 40, 40].map((n) => alert("malware", n)); // 160 -> 20% = 32
    const s = scoreCase(alerts, ["CRITICAL_ASSET_BOOST"]);
    expect(s.adjustments[0].points).toBe(30);
    expect(s.uncappedScore).toBe(190);
    expect(s.finalScore).toBe(100);
  });

  it("boosts the damped score, not the raw score", () => {
    const alerts = [alert("network_scan", 20), alert("network_scan", 20), alert("malware", 30)];
    const s = scoreCase(alerts, ["REPEAT_NOISE_DAMPING", "CRITICAL_ASSET_BOOST"]);
    expect(s.adjustments[1]).toMatchObject({ scoreBefore: 50, points: 10 });
    expect(s.finalScore).toBe(60);
    expect(s.severity).toBe("High");
  });
});

describe("APT_CAMPAIGN_LINK", () => {
  it("adds 25 when score is at least 50", () => {
    const s = scoreCase([alert("malware", 30), alert("phishing", 20)], ["APT_CAMPAIGN_LINK"]);
    expect(s.adjustments[0]).toMatchObject({ applied: true, points: 25 });
    expect(s.finalScore).toBe(75);
  });

  it("is not applied below 50", () => {
    const s = scoreCase([alert("malware", 30), alert("phishing", 19)], ["APT_CAMPAIGN_LINK"]);
    expect(s.adjustments[0]).toMatchObject({ applied: false, points: 0 });
    expect(s.finalScore).toBe(49);
  });

  it("checks the threshold after damping", () => {
    // raw 55 qualifies, but damped score 45 does not
    const alerts = [alert("network_scan", 10), alert("network_scan", 10), alert("malware", 35)];
    const s = scoreCase(alerts, ["REPEAT_NOISE_DAMPING", "APT_CAMPAIGN_LINK"]);
    expect(s.rawScore).toBe(55);
    expect(s.adjustments[1]).toMatchObject({ applied: false, scoreBefore: 45 });
    expect(s.finalScore).toBe(45);
  });

  it("is still subject to the 100 cap", () => {
    const s = scoreCase([alert("malware", 40), alert("malware", 40)], ["APT_CAMPAIGN_LINK"]);
    expect(s.uncappedScore).toBe(105);
    expect(s.finalScore).toBe(100);
  });
});

describe("parsePolicies", () => {
  it("accepts comma/space separated, case-insensitive input and dedupes", () => {
    expect(parsePolicies(" apt_campaign_link, repeat_noise_damping  APT_CAMPAIGN_LINK")).toEqual([
      "REPEAT_NOISE_DAMPING",
      "APT_CAMPAIGN_LINK",
    ]);
  });

  it("accepts an array", () => {
    expect(parsePolicies(["CRITICAL_ASSET_BOOST"])).toEqual(["CRITICAL_ASSET_BOOST"]);
  });

  it("treats empty input as no policies", () => {
    expect(parsePolicies("  ")).toEqual([]);
    expect(parsePolicies([])).toEqual([]);
  });

  it("rejects unknown policies", () => {
    expect(() => parsePolicies("SUPER_BOOST")).toThrow(PolicyValidationError);
  });

  it("rejects two escalation policies together", () => {
    expect(() => parsePolicies("CRITICAL_ASSET_BOOST,APT_CAMPAIGN_LINK")).toThrow(/Only one escalation/);
  });

  it("rejects non-string input", () => {
    expect(() => parsePolicies(42)).toThrow(PolicyValidationError);
    expect(() => parsePolicies([1, 2])).toThrow(PolicyValidationError);
  });
});
