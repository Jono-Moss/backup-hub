"use server";

import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@/db";
import {
  backupTask,
  backupRun,
  backupRunUpload,
  backupDestination,
  taskNotificationRecipient,
  taskShare,
  appUser,
  SCOPES,
  type Engine,
  type Scope,
  type DestinationType,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuid } from "uuid";
import { wrapConnection, wrapSecret, unwrapSecret, wrapDestinationConfig, unwrapDestinationConfig } from "@/lib/backup/crypto";
import { runBackupForTask, deleteRun, restoreRun, clearFailedRuns } from "@/lib/backup/runner";
import { resyncTask } from "@/lib/backup/scheduler";
import { purgeTask } from "@/lib/backup/purge";
import { getEngine } from "@/lib/backup/engines";
import { getDestination, listDestinationTypes } from "@/lib/backup/destinations";
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

// One row per (run, destination) upload — used to show off-site copy
// status ("Uploaded to S3 ✓", "Failed to upload to OneDrive") in the run
// history table alongside the local file's own status. `runIds` is expected
// to come from listRuns(taskId), but this re-checks the scope itself and
// only ever returns rows for runs that actually belong to taskId — a caller
// can't use it to read another task's upload history by passing foreign ids.
export async function listRunUploads(taskId: string, runIds: string[]) {
  await requireTaskScope(taskId, "tasks:read");
  if (runIds.length === 0) return [];
  return db
    .select({ upload: backupRunUpload })
    .from(backupRunUpload)
    .innerJoin(backupRun, eq(backupRun.id, backupRunUpload.runId))
    .where(and(eq(backupRun.taskId, taskId), inArray(backupRunUpload.runId, runIds)))
    .then((rows) => rows.map((r) => r.upload));
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

// --- Backup destinations (off-site save locations) ---
//
// Managed under the same `tasks:write` scope as notification recipients —
// anyone the owner shares "Manage tasks" with can add/remove destinations
// too. Restoring is owner-only, but destinations only ever add copies, they
// never touch the source database, so there's no reason to make them
// owner-only as well.

// Metadata for the provider dropdown + each provider's config field list,
// so the client component can render the right fields without a server
// round-trip per keystroke. Doesn't include any secrets, and isn't
// task-specific — no permission check beyond being logged in.
export async function listDestinationProviders() {
  await requireUser();
  return listDestinationTypes().map((d) => ({
    type: d.type,
    label: d.label,
    configFields: d.configFields,
    // Whether the provider has a "sign in" flow at all, and whether this
    // server has the client ID env vars needed to actually offer it.
    supportsConnect: !!d.connect,
    connectAvailable: d.connect?.isAvailable() ?? false,
  }));
}

export async function listTaskDestinations(taskId: string) {
  await requireTaskScope(taskId, "tasks:read");
  const rows = await db.select().from(backupDestination).where(eq(backupDestination.taskId, taskId));
  // Never send encryptedConfig to the client — it's ciphertext, not secret
  // by itself, but there's no reason to ship it to the browser at all.
  return rows.map(({ encryptedConfig, ...rest }) => rest);
}

function destinationConfigFromForm(formData: FormData): Record<string, string> {
  const config: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "type" || key === "label") continue;
    if (typeof value === "string") config[key] = value;
  }
  return config;
}

export async function addTaskDestination(taskId: string, formData: FormData) {
  await requireTaskScope(taskId, "tasks:write");
  const type = String(formData.get("type")) as DestinationType;
  const label = String(formData.get("label") || getDestination(type).label);

  await db.insert(backupDestination).values({
    id: uuid(),
    taskId,
    type,
    label,
    encryptedConfig: wrapDestinationConfig(destinationConfigFromForm(formData)),
  });
  revalidatePath(`/tasks/${taskId}`);
}

// Standalone check used by the "add destination" form before saving, same
// role as testConnection() plays for the database connection fields above.
// No taskId yet at this point (the destination isn't saved), so this only
// requires being logged in, not any particular task permission.
export async function testDestinationConnection(formData: FormData) {
  await requireUser();
  const type = String(formData.get("type")) as DestinationType;
  return getDestination(type).testConnection(destinationConfigFromForm(formData));
}

export async function toggleTaskDestinationEnabled(taskId: string, destinationId: string, enabled: boolean) {
  await requireTaskScope(taskId, "tasks:write");
  await db
    .update(backupDestination)
    .set({ enabled })
    .where(and(eq(backupDestination.id, destinationId), eq(backupDestination.taskId, taskId)));
  revalidatePath(`/tasks/${taskId}`);
}

export async function removeTaskDestination(taskId: string, destinationId: string) {
  await requireTaskScope(taskId, "tasks:write");
  await db
    .delete(backupDestination)
    .where(and(eq(backupDestination.id, destinationId), eq(backupDestination.taskId, taskId)));
  revalidatePath(`/tasks/${taskId}`);
}

// Re-runs testConnection with a destination's already-saved (encrypted)
// config — used by a "Test" button next to an existing destination, as
// opposed to the one on the add-destination form which tests in-progress,
// unsaved values.
export async function testExistingTaskDestination(taskId: string, destinationId: string) {
  await requireTaskScope(taskId, "tasks:write");
  const [dest] = await db
    .select()
    .from(backupDestination)
    .where(and(eq(backupDestination.id, destinationId), eq(backupDestination.taskId, taskId)))
    .limit(1);
  if (!dest) return { ok: false as const, message: "Destination not found." };

  const config = unwrapDestinationConfig(dest.encryptedConfig);
  return getDestination(dest.type).testConnection(config, {
    updateConfig: async (patch) => {
      Object.assign(config, patch);
      await db
        .update(backupDestination)
        .set({ encryptedConfig: wrapDestinationConfig(config) })
        .where(eq(backupDestination.id, destinationId));
    },
  });
}

// --- "Connect your account" (OAuth device flow) ---
//
// Two calls: start() gets a short code for the user to enter at the
// provider's site; the browser then polls poll() until they approve. The
// provider's device_code never reaches the browser in the clear — it's
// encrypted into an opaque token that the client just hands back, so no
// server-side session state is needed. And the resulting refresh token never
// reaches the browser at all: on approval, poll() saves the destination
// itself.

const CONNECT_TOKEN_TTL_BUFFER_MS = 10_000;

export async function startDestinationConnect(taskId: string, type: DestinationType) {
  await requireTaskScope(taskId, "tasks:write");
  const connector = getDestination(type).connect;
  if (!connector) return { ok: false as const, message: "This provider doesn't support signing in." };
  if (!connector.isAvailable()) {
    return { ok: false as const, message: "Sign-in isn't set up on this server yet — ask an admin to configure it (see the README), or use your own credentials under Advanced." };
  }

  try {
    const flow = await connector.start();
    const token = wrapSecret(
      JSON.stringify({
        type,
        taskId,
        state: flow.state,
        expiresAt: Date.now() + flow.expiresInSeconds * 1000 + CONNECT_TOKEN_TTL_BUFFER_MS,
      })
    );
    return {
      ok: true as const,
      token,
      userCode: flow.userCode,
      verificationUrl: flow.verificationUrl,
      intervalSeconds: Math.max(flow.intervalSeconds, 1),
      expiresInSeconds: flow.expiresInSeconds,
    };
  } catch (err: any) {
    return { ok: false as const, message: String(err.message ?? err) };
  }
}

export async function pollDestinationConnect(
  taskId: string,
  token: string,
  label: string,
  extra: Record<string, string>
): Promise<
  | { status: "pending"; slowDown?: boolean }
  | { status: "complete"; account?: string }
  | { status: "error"; message: string }
> {
  await requireTaskScope(taskId, "tasks:write");

  let payload: { type: DestinationType; taskId: string; state: Record<string, string>; expiresAt: number };
  try {
    payload = JSON.parse(unwrapSecret(token));
  } catch {
    return { status: "error", message: "Invalid or tampered sign-in session. Please start again." };
  }
  if (payload.taskId !== taskId) {
    return { status: "error", message: "This sign-in session belongs to a different task. Please start again." };
  }
  if (Date.now() > payload.expiresAt) {
    return { status: "error", message: "The code expired before it was approved. Try again." };
  }

  const destination = getDestination(payload.type);
  if (!destination.connect) return { status: "error", message: "This provider doesn't support signing in." };

  const result = await destination.connect.poll(payload.state);
  if (result.status !== "complete") return result;

  // Only accept the provider's NON-credential fields (folder, etc.) from the
  // browser — the client must not be able to smuggle in its own clientId /
  // refreshToken and have them stored alongside the real one.
  const allowedExtras = new Set(destination.configFields.filter((f) => !f.credential).map((f) => f.name));
  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (allowedExtras.has(key) && typeof value === "string" && value !== "") config[key] = value;
  }
  Object.assign(config, result.config);

  await db.insert(backupDestination).values({
    id: uuid(),
    taskId,
    type: payload.type,
    label: label.trim() || (result.account ? `${destination.label} (${result.account})` : destination.label),
    encryptedConfig: wrapDestinationConfig(config),
  });
  revalidatePath(`/tasks/${taskId}`);

  return { status: "complete", account: result.account };
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
