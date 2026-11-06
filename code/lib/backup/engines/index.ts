import type { Engine } from "@/db/schema";
import type { BackupEngine } from "./types";
import { mysqlEngine } from "./mysql";
import { postgresEngine } from "./postgres";
import { mongodbEngine } from "./mongodb";

const engines: Record<Engine, BackupEngine> = {
  mysql: mysqlEngine,
  postgres: postgresEngine,
  mongodb: mongodbEngine,
};

export function getEngine(name: Engine): BackupEngine {
  const engine = engines[name];
  if (!engine) throw new Error(`Unsupported database engine: ${name}`);
  return engine;
}
