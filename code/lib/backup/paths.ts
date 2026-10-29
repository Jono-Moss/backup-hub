import path from "path";

// Where backup files live on disk. Its own module so anything that needs a
// file path (runner, verify, downloads, purge) can import it without
// pulling in the whole backup runner.

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups";

export function taskDir(taskId: string) {
  // BACKUP_DIR comes from an env var, so Turbopack can't statically prove
  // this path stays scoped — without the ignore comment it conservatively
  // traces the entire project into the server bundle. This directory is
  // never used to resolve arbitrary user input beyond a UUID task id, so
  // it's safe to opt out of that tracing.
  return path.join(/* turbopackIgnore: true */ BACKUP_DIR, taskId);
}

export function getRunFilePath(taskId: string, filename: string) {
  return path.join(/* turbopackIgnore: true */ taskDir(taskId), filename);
}
