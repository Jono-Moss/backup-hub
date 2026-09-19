import type { ConnectionConfig } from "@/lib/backup/crypto";

export interface BackupEngine {
  /** Runs the native dump tool and writes a gzip-compressed dump to destPath. */
  dump(conn: ConnectionConfig, destPath: string): Promise<void>;
  /** Restores a gzip-compressed dump (as written by dump()) from srcPath into the target database. */
  restore(conn: ConnectionConfig, srcPath: string): Promise<void>;
  /** Quick connectivity check used by the "test connection" UI action. */
  testConnection(conn: ConnectionConfig): Promise<{ ok: boolean; message?: string }>;
}