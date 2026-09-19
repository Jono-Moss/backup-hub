import type { Engine } from "@/db/schema";
import type { BackupEngine } from "./types";
import { mysqlEngine } from "./mysql";
import { postgresEngine } from "./postgres";

const engines: Record<Engine, BackupEngine> = {
  mysql: mysqlEngine,
  postgres: postgresEngine,
};

export function getEngine(name: Engine): BackupEngine {
  const engine = engines[name];
  if (!engine) throw new Error(`Unsupported database engine: ${name}`);
  return engine;
}
