import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { DEFAULT_CASE_ID, type DB } from "./db.js";
import {
  addAlertToCase,
  clearCase,
  ConflictError,
  getCase,
  listAlerts,
  NotFoundError,
  removeAlertFromCase,
  setCasePolicies,
} from "./repository.js";
import { PolicyValidationError } from "./scoring.js";
import { POLICY_NAMES } from "./types.js";

class BadRequestError extends Error {}

function parseAlertId(value: unknown): number {
  const id = typeof value === "string" ? Number(value) : value;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("alertId must be a positive integer");
  }
  return id;
}

export function createApp(db: DB, options: { staticDir?: string } = {}) {
  const app = express();
  app.use(express.json({ limit: "10kb" }));

  const api = express.Router();
  const caseId = DEFAULT_CASE_ID;

  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  api.get("/alerts", (_req, res) => {
    res.json(listAlerts(db));
  });
  api.get("/policies", (_req, res) => {
    res.json(POLICY_NAMES);
  });
  api.get("/case", (_req, res) => {
    res.json(getCase(db, caseId));
  });
  api.get("/case/summary", (_req, res) => {
    res.json(getCase(db, caseId).summary);
  });
  api.post("/case/alerts", (req, res) => {
    res.status(201).json(addAlertToCase(db, caseId, parseAlertId(req.body?.alertId)));
  });
  api.delete("/case/alerts/:alertId", (req, res) => {
    res.json(removeAlertFromCase(db, caseId, parseAlertId(req.params.alertId)));
  });
  api.put("/case/policies", (req, res) => {
    if (req.body?.policies === undefined) throw new BadRequestError("policies is required");
    res.json(setCasePolicies(db, caseId, req.body.policies));
  });
  api.delete("/case", (_req, res) => {
    res.json(clearCase(db, caseId));
  });
  api.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use("/api", api);

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof BadRequestError || err instanceof PolicyValidationError) {
      res.status(400).json({ error: err.message });
    } else if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message });
    } else if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON body" });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  app.use(errorHandler);

  return app;
}
