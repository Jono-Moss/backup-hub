import fs from "fs";
import path from "path";
import { db } from "@/db";
import { backupTask, backupRun, taskNotificationRecipient, taskShare, apiKey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { taskDir } from "@/lib/backup/runner";
import { unscheduleTask } from "@/lib/backup/scheduler";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETED_TASK_MANIFEST = "_deleted-task.json";

// Removes a task and everything in the database hanging off it: run history,
// notification recipients, shares, and any API keys pinned to it.
//
// `deleteFiles` decides what happens to the backup files on disk:
//   - true:  the task's folder is removed too. Nothing is left behind.
//   - false: the files stay exactly where they are, so they can still be
//            recovered by hand from the server after the task is gone from
//            the UI/DB. A small manifest is written next to them saying
//            which task they came from and which file belongs to which run.
//
// Only an explicit `true` deletes files; anything else keeps them.
// Callers are responsible for authorization; this does no permission check.
export async function purgeTask(taskId: string, opts: { deleteFiles: boolean }) {
  // taskDir(taskId) can be rm -rf'd below — refuse anything that isn't a real
  // UUID so an empty/odd id can never resolve to BACKUP_DIR itself.
  if (!UUID_RE.test(taskId)) throw new Error("Invalid task id");
  const deleteFiles = opts.deleteFiles === true;
  const dir = taskDir(taskId);

  if (!deleteFiles) {
    await writeManifest(taskId, dir);
  }

  unscheduleTask(taskId);

  await db.delete(backupRun).where(eq(backupRun.taskId, taskId));
  await db.delete(taskNotificationRecipient).where(eq(taskNotificationRecipient.taskId, taskId));
  await db.delete(taskShare).where(eq(taskShare.taskId, taskId));
  await db.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.taskId, taskId));
  await db.delete(backupTask).where(eq(backupTask.id, taskId));

  if (deleteFiles) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch((err) => {
      console.error(`[purge] could not remove backup files for task ${taskId}:`, err);
    });
  }
}

// Best effort: a failure here must never block the delete the user asked for.
// Deliberately contains no connection details or passwords. Encrypted
// backups still need the password they were encrypted with to be opened.
async function writeManifest(taskId: string, dir: string) {
  try {
    if (!fs.existsSync(dir)) return;

    const [task] = await db.select().from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
    const runs = await db.select().from(backupRun).where(eq(backupRun.taskId, taskId));

    const manifest = {
      note: "This task was deleted from Backup Hub but its backup files were kept on disk.",
      deletedAt: new Date().toISOString(),
      task: task
        ? { id: task.id, name: task.name, engine: task.engine, ownerId: task.ownerId, createdAt: task.createdAt }
        : { id: taskId },
      backups: runs
        .filter((r) => r.filename)
        .map((r) => ({
          filename: r.filename,
          status: r.status,
          startedAt: r.startedAt,
          sizeBytes: r.sizeBytes,
          encrypted: r.encrypted,
        })),
    };

    await fs.promises.writeFile(path.join(dir, DELETED_TASK_MANIFEST), JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error(`[purge] could not write manifest for task ${taskId}:`, err);
  }
}
