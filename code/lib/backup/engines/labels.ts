import type { Engine } from "@/db/schema";

// How each engine is named in the UI. The stored value stays "mysql" /
// "postgres" / "mongodb"; the labels say which compatible databases each covers.
export const ENGINE_LABELS: Record<Engine, string> = {
  mysql: "MySQL / MariaDB",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
};

/** Port used when the task form's port is left blank. */
export const DEFAULT_PORTS: Record<Engine, number> = {
  mysql: 3306,
  postgres: 5432,
  mongodb: 27017,
};

/** Shown under the engine picker on the new-task form, for the selected engine. */
export const ENGINE_COMPATIBILITY: Record<Engine, string> = {
  mysql: "Also MySQL-compatible services such as Amazon RDS / Aurora MySQL, PlanetScale and TiDB.",
  postgres: "Also Postgres-compatible services such as Supabase, Neon, Amazon RDS / Aurora PostgreSQL and TimescaleDB.",
  mongodb:
    "Self-hosted MongoDB and MongoDB Atlas — for Atlas, enter the cluster's host (e.g. cluster0.abcde.mongodb.net); it connects with TLS automatically.",
};
