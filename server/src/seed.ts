// CLI: `npm run db:seed` (dev) or `node dist/server/seed.js` (prod).
// Creates the schema if needed and upserts the seed alerts. Pass --reset to also empty the case.
import { DEFAULT_CASE_ID, openDatabase, seedAlerts } from "./db.js";
import { clearCase } from "./repository.js";

const dbPath = process.env.DATABASE_PATH ?? "data/app.db";
const db = openDatabase(dbPath);
seedAlerts(db);
if (process.argv.includes("--reset")) clearCase(db, DEFAULT_CASE_ID);
const { n } = db.prepare("SELECT COUNT(*) AS n FROM alerts").get() as { n: number };
console.log(`Seeded ${dbPath}: ${n} alerts${process.argv.includes("--reset") ? ", case reset" : ""}`);
db.close();
