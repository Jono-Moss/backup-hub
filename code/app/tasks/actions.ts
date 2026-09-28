"use server";

import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@/db";
import {
  backupTask,
  backupRun,
  taskNotificationRecipient,
  taskShare,
  appUser,
  SCOPES,
  type Engine,
  type Scope,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuid } from "uuid";
import { wrapConnection, wrapSecret } from "@/lib/backup/crypto";
import { runBackupForTask, deleteRun, restoreRun, clearFailedRuns } from "@/lib/backup/runner";
import { resyncTask } from "@/lib/backup/scheduler";
import { purgeTask } from "@/lib/backup/purge";
import { getEngine } from "@/lib/backup/engines";
import { requireUser } from "@/lib/auth/session";
import {
  getTaskAccess,
  requireTaskScope,
  requireTaskOwner,
  listAccessibleTasks,
  canDo,
} from "@/lib/auth/task-access";
import { notifySystemEvent } from "@/lib/notifications/notify";

// Tasks the current user owns or that have been shared with them.
export async function listTasks() {
  const me = await requireUser();
  return listAccessibleTasks(me.id);
}

// Returns null both for a missing task and for one the user can't see, so
// the page renders the same 404 either way. `access` tells the UI which
// controls to show; the actions below re-check every permission themselves.
export async function getTask(id: string) {
  const me = await requireUser();
  const access = await getTaskAccess(me.id, id);
  if (!access || !canDo(access, "tasks:read")) return null;

  const [row] = await db
    .select({ task: backupTask, ownerName: appUser.name })
    .from(backupTask)
    .leftJoin(appUser, eq(appUser.id, backupTask.ownerId))
    .where(eq(backupTask.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.task, ownerName: row.ownerName ?? "Unknown", access };
}

export async function listRuns(taskId: string) {
  await requireTaskScope(taskId, "tasks:read");
  return db.select().from(backupRun).where(eq(backupRun.taskId, taskId)).orderBy(desc(backupRun.startedAt));
}

export async function createTask(formData: FormData) {
  const me = await requireUser();
  const id = uuid();
  const engine = String(formData.get("engine")) as Engine;
  const backupPassword = String(formData.get("backupPassword") ?? "");
  const encryptionEnabled = formData.get("encryptionEnabled") === "on";
  const name = String(formData.get("name"));

  await db.insert(backupTask).values({
    id,
    ownerId: me.id,
    name,
    engine,
    encryptedConnection: wrapConnection({
      host: String(formData.get("host")),
      port: Number(formData.get("port")) || (engine === "postgres" ? 5432 : 3306),
      user: String(formData.get("user")),
      password: String(formData.get("password")),
      database: String(formData.get("database")),
      ssl: formData.get("ssl") === "on",
    }),
    cronExpression: String(formData.get("cronExpression") || "0 3 * * *"),
    retentionCount: Number(formData.get("retentionCount")) || 7,
    encryptionEnabled,
    encryptedBackupPassword: encryptionEnabled && backupPassword ? wrapSecret(backupPassword) : null,
  });

  await resyncTask(id);

  notifySystemEvent("task_created", `${me.name} created the backup task "${name}".`).catch((err) =>
    console.error("[notify] task_created email failed:", err)
  );

  revalidatePath("/");
  redirect(`/tasks/${id}`);
}

export async function testConnection(formData: FormData) {
  await requireUser();
  const engine = String(formData.get("engine")) as Engine;
  const result = await getEngine(engine).testConnection({
    host: String(formData.get("host")),
    port: Number(formData.get("port")) || (engine === "postgres" ? 5432 : 3306),
    user: String(formData.get("user")),
    password: String(formData.get("password")),
    database: String(formData.get("database")),
    ssl: formData.get("ssl") === "on",
  });
  return result;
}

// Runs a real dump with the in-progress form's connection details — not
// just a connectivity check like testConnection above, but the actual
// mysqldump/pg_dump the scheduled task would run, written to a scratch
// file and then discarded. This is what catches problems testConnection
// can't: missing dump privileges, SSL negotiation specifically during the
// dump tool's connection (as opposed to the driver testConnection uses),
// locked tables, etc. Because it's a full dump, it does the same amount of
// work (and takes the same time, and puts the same read load on the
// source database) as a real scheduled backup would — it just never
// touches the database's row or the backups folder on disk.
export async function dryRunBackup(formData: FormData) {
  await requireUser();
  const engine = String(formData.get("engine")) as Engine;
  const conn = {
    host: String(formData.get("host")),
    port: Number(formData.get("port")) || (engine === "postgres" ? 5432 : 3306),
    user: String(formData.get("user")),
    password: String(formData.get("password")),
    database: String(formData.get("database")),
    ssl: formData.get("ssl") === "on",
  };

  const tempPath = path.join(os.tmpdir(), `dryrun-${uuid()}.sql.gz`);
  try {
    await getEngine(engine).dump(conn, tempPath);
    const stat = await fs.promises.stat(tempPath);
    return { ok: true as const, sizeBytes: stat.size };
  } catch (err: any) {
    return { ok: false as const, message: String(err.message ?? err).slice(0, 2048) };
  } finally {
    // Never leave the scratch dump behind, success or failure — this
    // action is explicitly "throw it away", not "save a backup".
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

export async function updateTaskSettings(taskId: string, formData: FormData) {
  await requireTaskScope(taskId, "tasks:write");
  const encryptionEnabled = formData.get("encryptionEnabled") === "on";
  const backupPassword = String(formData.get("backupPassword") ?? "");

  const updates: Record<string, unknown> = {
    name: String(formData.get("name")),
    cronExpression: String(formData.get("cronExpression") || "0 3 * * *"),
    retentionCount: Number(formData.get("retentionCount")) || 7,
    encryptionEnabled,
  };
  if (backupPassword) {
    updates.encryptedBackupPassword = wrapSecret(backupPassword);
  }

  await db.update(backupTask).set(updates).where(eq(backupTask.id, taskId));
  await resyncTask(taskId);
  revalidatePath(`/tasks/${taskId}`);
}

export async function toggleTaskEnabled(taskId: string, enabled: boolean) {
  await requireTaskScope(taskId, "tasks:write");
  await db.update(backupTask).set({ enabled }).where(eq(backupTask.id, taskId));
  await resyncTask(taskId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// `deleteFiles` = also remove the backup files from disk. When false the files
// stay on the server (recoverable by hand) even though the task and its
// history are gone from the app.
export async function deleteTask(taskId: string, deleteFiles: boolean) {
  const { user: me } = await requireTaskScope(taskId, "tasks:write");
  const [task] = await db.select().from(backupTask).where(eq(backupTask.id, taskId)).limit(1);

  // Also removes run history, recipients and shares (and files if asked to).
  await purgeTask(taskId, { deleteFiles: deleteFiles === true });

  if (task) {
    notifySystemEvent("task_deleted", `${me.name} deleted the backup task "${task.name}".`).catch((err) =>
      console.error("[notify] task_deleted email failed:", err)
    );
  }

  revalidatePath("/");
  redirect("/");
}

export async function runNow(taskId: string) {
  await requireTaskScope(taskId, "runs:trigger");
  await runBackupForTask(taskId, "manual");
  revalidatePath(`/tasks/${taskId}`);
}

// Confirms the run really belongs to the task the permission was checked
// against — otherwise a caller could pass a task they may manage together
// with a run id from somebody else's task.
async function assertRunInTask(taskId: string, runId: string) {
  const [run] = await db
    .select({ id: backupRun.id })
    .from(backupRun)
    .where(and(eq(backupRun.id, runId), eq(backupRun.taskId, taskId)))
    .limit(1);
  if (!run) throw new Error("Backup not found");
}

export async function deleteBackupRun(taskId: string, runId: string) {
  await requireTaskScope(taskId, "runs:delete");
  await assertRunInTask(taskId, runId);
  await deleteRun(runId);
  revalidatePath(`/tasks/${taskId}`);
}

export async function clearFailedBackupRuns(taskId: string) {
  await requireTaskScope(taskId, "runs:delete");
  const count = await clearFailedRuns(taskId);
  revalidatePath(`/tasks/${taskId}`);
  return count;
}

// Restore overwrites the task's source database, so it is owner-only and not
// covered by any shareable permission.
export async function restoreBackupRun(taskId: string, runId: string, password?: string) {
  await requireTaskOwner(taskId);
  await assertRunInTask(taskId, runId);
  const result = await restoreRun(runId, password);
  revalidatePath(`/tasks/${taskId}`);
  return result;
}

// --- Per-task notification recipients ---

export async function listTaskRecipients(taskId: string) {
  await requireTaskScope(taskId, "tasks:read");
  return db.select().from(taskNotificationRecipient).where(eq(taskNotificationRecipient.taskId, taskId));
}

export async function addTaskRecipient(taskId: string, formData: FormData) {
  await requireTaskScope(taskId, "tasks:write");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) throw new Error("Email is required");

  await db.insert(taskNotificationRecipient).values({
    id: uuid(),
    taskId,
    email,
    notifyOnSuccess: formData.get("notifyOnSuccess") === "on",
    notifyOnFailure: formData.get("notifyOnFailure") === "on",
  });
  revalidatePath(`/tasks/${taskId}`);
}

export async function removeTaskRecipient(taskId: string, recipientId: string) {
  await requireTaskScope(taskId, "tasks:write");
  await db
    .delete(taskNotificationRecipient)
    .where(and(eq(taskNotificationRecipient.id, recipientId), eq(taskNotificationRecipient.taskId, taskId)));
  revalidatePath(`/tasks/${taskId}`);
}

// --- Sharing (owner only) ---

export async function listTaskShares(taskId: string) {
  await requireTaskOwner(taskId);
  return db
    .select({
      id: taskShare.id,
      userId: taskShare.userId,
      name: appUser.name,
      email: appUser.email,
      scopes: taskShare.scopes,
    })
    .from(taskShare)
    .innerJoin(appUser, eq(appUser.id, taskShare.userId))
    .where(eq(taskShare.taskId, taskId))
    .orderBy(desc(taskShare.createdAt));
}

// Grants (or updates) another user's permissions on this task. "View tasks"
// is always included — every other permission is meaningless without it.
// Returns a result rather than throwing so the form can show the message.
export async function shareTask(
  taskId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await requireTaskOwner(taskId);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Enter the email of the user to share with." };

  const requested = formData.getAll("scopes").map(String);
  const scopes = SCOPES.filter((s) => s === "tasks:read" || requested.includes(s)) as Scope[];

  const [target] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email)).limit(1);
  if (!target) return { ok: false, message: "No user with that email." };
  if (target.id === me.id) return { ok: false, message: "You already own this task." };

  const [existing] = await db
    .select({ id: taskShare.id })
    .from(taskShare)
    .where(and(eq(taskShare.taskId, taskId), eq(taskShare.userId, target.id)))
    .limit(1);

  if (existing) {
    await db.update(taskShare).set({ scopes }).where(eq(taskShare.id, existing.id));
  } else {
    await db.insert(taskShare).values({ id: uuid(), taskId, userId: target.id, scopes });
  }

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function revokeTaskShare(taskId: string, shareId: string) {
  await requireTaskOwner(taskId);
  await db.delete(taskShare).where(and(eq(taskShare.id, shareId), eq(taskShare.taskId, taskId)));
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}
