import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SEED_ALERTS } from "./seed-data.js";
import { CATEGORIES } from "./types.js";

export type DB = Database.Database;

/** The app manages a single case; it is created by the migration. */
export const DEFAULT_CASE_ID = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY,
  title       TEXT    NOT NULL,
  category    TEXT    NOT NULL CHECK (category IN (${CATEGORIES.map((c) => `'${c}'`).join(", ")})),
  source_host TEXT    NOT NULL,
  base_score  INTEGER NOT NULL CHECK (base_score BETWEEN 1 AND 40)
);

CREATE TABLE IF NOT EXISTS cases (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  -- JSON array of validated policy names. Only the selection is stored; the score never is.
  policies   TEXT    NOT NULL DEFAULT '[]',
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_alerts (
  case_id  INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  added_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (case_id, alert_id)
);
`;

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** Idempotent: creates tables, the default case, and seeds alerts if the table is empty. */
export function migrate(db: DB): void {
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO cases (id, name) VALUES (?, ?)").run(DEFAULT_CASE_ID, "Default case");
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM alerts").get() as { n: number };
  if (n === 0) seedAlerts(db);
}

/** Upserts the seed alerts by id. Safe to re-run; does not touch case membership. */
export function seedAlerts(db: DB): void {
  const upsert = db.prepare(`
    INSERT INTO alerts (id, title, category, source_host, base_score)
    VALUES (@id, @title, @category, @sourceHost, @baseScore)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, category = excluded.category,
      source_host = excluded.source_host, base_score = excluded.base_score
  `);
  db.transaction(() => SEED_ALERTS.forEach((a) => upsert.run(a)))();
}
