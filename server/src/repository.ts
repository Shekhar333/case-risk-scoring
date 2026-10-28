import type { DB } from "./db.js";
import { parsePolicies, scoreCase } from "./scoring.js";
import type { Alert, CaseView, PolicyName } from "./types.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const ALERT_COLUMNS = "a.id, a.title, a.category, a.source_host AS sourceHost, a.base_score AS baseScore";

export function listAlerts(db: DB): Alert[] {
  return db.prepare(`SELECT ${ALERT_COLUMNS} FROM alerts a ORDER BY a.id`).all() as Alert[];
}

function caseAlerts(db: DB, caseId: number): Alert[] {
  return db
    .prepare(
      `SELECT ${ALERT_COLUMNS} FROM case_alerts ca JOIN alerts a ON a.id = ca.alert_id
       WHERE ca.case_id = ? ORDER BY ca.rowid`,
    )
    .all(caseId) as Alert[];
}

function storedPolicies(db: DB, caseId: number): PolicyName[] {
  const row = db.prepare("SELECT policies FROM cases WHERE id = ?").get(caseId) as { policies: string } | undefined;
  if (!row) throw new NotFoundError(`Case ${caseId} not found`);
  // Re-validate on read so a hand-edited row can never produce an invalid combination.
  return parsePolicies(JSON.parse(row.policies));
}

/** Loads the case and recomputes its summary from current state. */
export function getCase(db: DB, caseId: number): CaseView {
  const policies = storedPolicies(db, caseId);
  const alerts = caseAlerts(db, caseId);
  return { id: caseId, alerts, policies, summary: scoreCase(alerts, policies) };
}

function touch(db: DB, caseId: number): void {
  db.prepare("UPDATE cases SET updated_at = datetime('now') WHERE id = ?").run(caseId);
}

export function addAlertToCase(db: DB, caseId: number, alertId: number): CaseView {
  storedPolicies(db, caseId); // asserts the case exists
  if (!db.prepare("SELECT 1 FROM alerts WHERE id = ?").get(alertId)) {
    throw new NotFoundError(`Alert ${alertId} not found`);
  }
  const result = db
    .prepare("INSERT OR IGNORE INTO case_alerts (case_id, alert_id) VALUES (?, ?)")
    .run(caseId, alertId);
  if (result.changes === 0) throw new ConflictError(`Alert ${alertId} is already in the case`);
  touch(db, caseId);
  return getCase(db, caseId);
}

export function removeAlertFromCase(db: DB, caseId: number, alertId: number): CaseView {
  const result = db.prepare("DELETE FROM case_alerts WHERE case_id = ? AND alert_id = ?").run(caseId, alertId);
  if (result.changes === 0) throw new NotFoundError(`Alert ${alertId} is not in the case`);
  touch(db, caseId);
  return getCase(db, caseId);
}

export function setCasePolicies(db: DB, caseId: number, input: unknown): CaseView {
  const policies = parsePolicies(input);
  const result = db
    .prepare("UPDATE cases SET policies = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(policies), caseId);
  if (result.changes === 0) throw new NotFoundError(`Case ${caseId} not found`);
  return getCase(db, caseId);
}

export function clearCase(db: DB, caseId: number): CaseView {
  db.transaction(() => {
    db.prepare("DELETE FROM case_alerts WHERE case_id = ?").run(caseId);
    db.prepare("UPDATE cases SET policies = '[]', updated_at = datetime('now') WHERE id = ?").run(caseId);
  })();
  return getCase(db, caseId);
}
