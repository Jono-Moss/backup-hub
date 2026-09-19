import { migrate } from "drizzle-orm/mysql2/migrator";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import "dotenv/config";

// Retries the initial connection rather than requiring an external
// wait-for-it step, since this runs as part of the container's entrypoint
// (see entrypoint.sh) before there's any other guarantee the database is
// actually accepting connections yet — docker-compose's healthcheck covers
// the bundled db service, but this script has no such guarantee if it's
// ever run outside that exact compose setup (Kubernetes, a bare `docker
// run`, etc.), so it's more robust to handle it here directly.
const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

async function connectWithRetry(url: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await mysql.createConnection(url);
    } catch (err: any) {
      if (attempt === MAX_ATTEMPTS) throw err;
      console.log(`Database not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}: ${err.code ?? err.message}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  if (!process.env.APP_DATABASE_URL) {
    throw new Error(
      "APP_DATABASE_URL is not set. Copy example.env-file to .env and fill it in, or export it before running this command."
    );
  }

  console.log("Connecting to the database...");
  const connection = await connectWithRetry(process.env.APP_DATABASE_URL);
  const db = drizzle(connection);

  console.log("Running migrations...");

  await migrate(db, { migrationsFolder: "./db/migrations" });

  console.log("Migrations up to date.");
  await connection.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});