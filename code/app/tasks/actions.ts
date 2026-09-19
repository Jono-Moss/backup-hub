"use server";

import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@/db";
import { backupTask, backupRun, taskNotificationRecipient, type Engine } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuid } from "uuid";
import { wrapConnection, wrapSecret } from "@/lib/backup/crypto";
import { runBackupForTask, deleteRun, restoreRun, clearFailedRuns } from "@/lib/backup/runner";
import { resyncTask, unscheduleTask } from "@/lib/backup/scheduler";
import { getEngine } from "@/lib/backup/engines";
import { requireUser } from "@/lib/auth/session";
import { notifySystemEvent } from "@/lib/notifications/notify";

export async function listTasks() {
  await requireUser();
  return db.select().from(backupTask).orderBy(desc(backupTask.createdAt));
}

export async function getTask(id: string) {
  await requireUser();
  const [task] = await db.select().from(backupTask).where(eq(backupTask.id, id)).limit(1);
  return task ?? null;
}

export async function listRuns(taskId: string) {
  await requireUser();
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
  await requireUser();
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
  await requireUser();
  await db.update(backupTask).set({ enabled }).where(eq(backupTask.id, taskId));
  await resyncTask(taskId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

export async function deleteTask(taskId: string) {
  const me = await requireUser();
  const [task] = await db.select().from(backupTask).where(eq(backupTask.id, taskId)).limit(1);

  unscheduleTask(taskId);
  await db.delete(backupTask).where(eq(backupTask.id, taskId));

  if (task) {
    notifySystemEvent("task_deleted", `${me.name} deleted the backup task "${task.name}".`).catch((err) =>
      console.error("[notify] task_deleted email failed:", err)
    );
  }

  revalidatePath("/");
  redirect("/");
}

export async function runNow(taskId: string) {
  await requireUser();
  await runBackupForTask(taskId, "manual");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteBackupRun(taskId: string, runId: string) {
  await requireUser();
  await deleteRun(runId);
  revalidatePath(`/tasks/${taskId}`);
}

export async function clearFailedBackupRuns(taskId: string) {
  await requireUser();
  const count = await clearFailedRuns(taskId);
  revalidatePath(`/tasks/${taskId}`);
  return count;
}

export async function restoreBackupRun(taskId: string, runId: string, password?: string) {
  await requireUser();
  const result = await restoreRun(runId, password);
  revalidatePath(`/tasks/${taskId}`);
  return result;
}

// --- Per-task notification recipients ---

export async function listTaskRecipients(taskId: string) {
  await requireUser();
  return db.select().from(taskNotificationRecipient).where(eq(taskNotificationRecipient.taskId, taskId));
}

export async function addTaskRecipient(taskId: string, formData: FormData) {
  await requireUser();
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
  await requireUser();
  await db.delete(taskNotificationRecipient).where(eq(taskNotificationRecipient.id, recipientId));
  revalidatePath(`/tasks/${taskId}`);
}