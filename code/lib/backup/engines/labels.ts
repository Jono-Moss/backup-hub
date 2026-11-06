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

// The note under the engine picker for each engine is translated: see
// translations/<locale>.json "engines.compatibility".
