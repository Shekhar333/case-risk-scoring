import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DATABASE_PATH ?? "data/app.db";
const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both server/src (tsx) and dist/server (compiled): client build lives at <root>/client/dist.
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, "../../client/dist");

const db = openDatabase(dbPath);
const app = createApp(db, { staticDir });

const server = app.listen(port, () => {
  console.log(`Case risk scoring API listening on http://localhost:${port} (db: ${dbPath})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
