import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { backupTask, backupRun, type RunTrigger } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { unwrapConnection, unwrapSecret, encryptFile, decryptFile } from "@/lib/backup/crypto";
import { getEngine } from "@/lib/backup/engines";
import { notifyTaskSuccess, notifyTaskFailure } from "@/lib/notifications/notify";

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups";

function taskDir(taskId: string) {
  // BACKUP_DIR comes from an env var, so Turbopack can't statically prove
  // this path stays scoped — without the ignore comment it conservatively
  // traces the entire project into the server bundle. This directory is
  // never used to resolve arbitrary user input beyond a UUID task id, so
  // it's safe to opt out of that tracing.
  return path.join(/* turbopackIgnore: true */ BACKUP_DIR, taskId);
}

export async function runBackupForTask(taskId: string, triggeredBy: RunTrigger = "manual") {
  const [task] = await db.select().from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (!task.enabled && triggeredBy === "cron") {
    // Cron silently skips disabled tasks; manual/API triggers still honor an explicit request.
    return null;
  }

  const runId = uuid();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${task.name.replace(/[^a-z0-9-_]+/gi, "-")}-${timestamp}.sql.gz`;
  const dir = taskDir(task.id);
  const rawPath = path.join(dir, baseName);

  await db.insert(backupRun).values({
    id: runId,
    taskId: task.id,
    filename: baseName,
    status: "running",
    triggeredBy,
  });

  try {
    const conn = unwrapConnection(task.encryptedConnection);
    const engine = getEngine(task.engine);

    await engine.dump(conn, rawPath);

    let finalPath = rawPath;
    let finalName = baseName;
    let encrypted = false;

    if (task.encryptionEnabled && task.encryptedBackupPassword) {
      const password = unwrapSecret(task.encryptedBackupPassword);
      finalName = `${baseName}.enc`;
      finalPath = path.join(dir, finalName);
      await encryptFile(rawPath, finalPath, password);
      await fs.promises.unlink(rawPath); // never keep the unencrypted copy around
      encrypted = true;
    }

    const stat = await fs.promises.stat(/*turbopackIgnore: true*/ finalPath);

    await db
      .update(backupRun)
      .set({
        filename: finalName,
        sizeBytes: stat.size,
        encrypted,
        status: "completed",
        finishedAt: new Date(),
      })
      .where(eq(backupRun.id, runId));

    await pruneOldRuns(task.id, task.retentionCount);

    notifyTaskSuccess(task.id, finalName, stat.size).catch((err) =>
      console.error("[notify] task success email failed:", err)
    );

    return { runId, filename: finalName, sizeBytes: stat.size };
  } catch (err: any) {
    const message = String(err.message ?? err).slice(0, 2048);

    // engine.dump() (and, if we got that far, encryptFile()) may have
    // already created a file on disk before failing partway through — an
    // empty or partial dump, or an empty or partial .enc file. Don't leave
    // that behind: a failed run should leave no backup file, not a 0-byte
    // one that looks like real output in the folder listing.
    for (const leftover of [rawPath, `${rawPath}.enc`]) {
      await fs.promises.unlink(leftover).catch(() => {});
    }

    await db
      .update(backupRun)
      .set({
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
      })
      .where(eq(backupRun.id, runId));

    notifyTaskFailure(task.id, message).catch((notifyErr) =>
      console.error("[notify] task failure email failed:", notifyErr)
    );

    throw err;
  }
}

async function pruneOldRuns(taskId: string, keep: number) {
  const completed = await db
    .select()
    .from(backupRun)
    .where(and(eq(backupRun.taskId, taskId), eq(backupRun.status, "completed")))
    .orderBy(desc(backupRun.startedAt));

  const toDelete = completed.slice(keep);
  for (const run of toDelete) {
    if (run.filename) {
      await fs.promises.unlink(path.join(taskDir(taskId), run.filename)).catch(() => {});
    }
    await db.delete(backupRun).where(eq(backupRun.id, run.id));
  }
}

// Manual cleanup for the "Remove all failed backups" button — failed runs
// are never pruned automatically (pruneOldRuns above only ever looks at
// "completed" runs), so without this they'd accumulate in the task's
// history indefinitely. Returns how many were removed, for the UI to
// confirm. Also attempts to unlink any file on disk, though the failure
// path in runBackupForTask already cleans those up itself — this is just
// defense in depth against a run from before that fix existed.
export async function clearFailedRuns(taskId: string): Promise<number> {
  const failed = await db
    .select()
    .from(backupRun)
    .where(and(eq(backupRun.taskId, taskId), eq(backupRun.status, "failed")));

  for (const run of failed) {
    if (run.filename) {
      await fs.promises.unlink(path.join(taskDir(taskId), run.filename)).catch(() => {});
    }
  }
  if (failed.length > 0) {
    await db
      .delete(backupRun)
      .where(and(eq(backupRun.taskId, taskId), eq(backupRun.status, "failed")));
  }
  return failed.length;
}

export async function deleteRun(runId: string) {
  const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
  if (!run) return;
  if (run.filename) {
    await fs.promises.unlink(path.join(taskDir(run.taskId), run.filename)).catch(() => {});
  }
  await db.delete(backupRun).where(eq(backupRun.id, runId));
}

export function getRunFilePath(taskId: string, filename: string) {
  return path.join(/* turbopackIgnore: true */ taskDir(taskId), filename);
}

// Restores one completed run's backup file into its task's own target
// database. Returns a result object rather than throwing, so the calling
// UI action can show the person exactly why a restore failed (this is a
// destructive operation — a silent failure is worse than usual here).
//
// `password` must be supplied by the caller for encrypted runs rather than
// falling back to the task's currently-stored backup password: if the
// password was ever changed on the task after this particular run was
// taken, task.encryptedBackupPassword no longer matches what this file was
// actually encrypted with, and silently using it would either fail with a
// confusing auth-tag error or — worse — quietly succeed against the wrong
// assumption. Asking the person for the password each time also means the
// server never needs to be trusted with a plaintext copy longer than a
// single restore call.
export async function restoreRun(
  runId: string,
  password?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
  if (!run) return { ok: false, message: "Backup run not found." };
  if (run.status !== "completed" || !run.filename) {
    return { ok: false, message: "Only a completed backup with a file can be restored." };
  }
  if (run.encrypted && !password) {
    return { ok: false, message: "This backup is encrypted — its password is required to restore it." };
  }

  const [task] = await db.select().from(backupTask).where(eq(backupTask.id, run.taskId)).limit(1);
  if (!task) return { ok: false, message: "The task this backup belongs to no longer exists." };

  const filePath = getRunFilePath(run.taskId, run.filename);
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat) return { ok: false, message: "Backup file is missing on disk." };

  let restoreSrcPath = filePath;
  let tempPath: string | null = null;

  try {
    if (run.encrypted) {
      tempPath = path.join(os.tmpdir(), `restore-${runId}-${Date.now()}.sql.gz`);
      try {
        await decryptFile(filePath, tempPath, password!);
      } catch {
        // AES-GCM auth-tag verification failure looks the same as any other
        // decrypt error to Node — but the overwhelmingly likely cause here
        // is simply a wrong password, so say that instead of a raw crypto
        // exception.
        return { ok: false, message: "Couldn't decrypt this backup — the password may be incorrect." };
      }
      restoreSrcPath = tempPath;
    }

    const conn = unwrapConnection(task.encryptedConnection);
    const engine = getEngine(task.engine);
    await engine.restore(conn, restoreSrcPath);

    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: String(err.message ?? err).slice(0, 2048) };
  } finally {
    // Always clean up the decrypted scratch copy, success or failure — it
    // must never be left sitting unencrypted in the OS temp dir.
    if (tempPath) {
      await fs.promises.unlink(tempPath).catch(() => {});
    }
  }
}