import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// Next.js loads .env / .env.local automatically at runtime, so this import
// is only load-bearing when db/index.ts is imported from a plain tsx script
// outside the Next.js process (e.g. a one-off maintenance script). It's a
// harmless no-op inside Next.js since the vars are already set by then.
import "dotenv/config";

if (!process.env.APP_DATABASE_URL) {
  throw new Error("APP_DATABASE_URL is required (Backup Hub's own database, not a backed-up DB)");
}

const pool = mysql.createPool(process.env.APP_DATABASE_URL);

export const db = drizzle(pool, { schema, mode: "default" });
