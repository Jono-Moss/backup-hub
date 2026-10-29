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
  taskDestination,
  DESTINATION_TYPES,
  taskNotificationRecipient,
  notificationChannel,
  taskShare,
  appUser,
  SCOPES,
  type Engine,
  type Scope,
  type DestinationType,
} from "@/db/schema";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuid } from "uuid";
import { wrapConnection, wrapSecret, unwrapSecret } from "@/lib/backup/crypto";
import { runBackupForTask, deleteRun, restoreRun, clearFailedRuns } from "@/lib/backup/runner";
import { enqueueVerify, testRestoreAvailable } from "@/lib/backup/verify";
import { resyncTask } from "@/lib/backup/scheduler";
import { purgeTask } from "@/lib/backup/purge";
import { getEngine } from "@/lib/backup/engines";
import { getDestination, listDestinationTypes } from "@/lib/backup/destinations";
import {
  configForLink,
  createDestination,
  deleteDestination,
  getLink,
  linkDestination,
  listLinksForTask,
  normalizeSubfolder,
  persistingRuntime,
  readConfig,
} from "@/lib/backup/destinations/store";
import { requireUser } from "@/lib/auth/session";
import {
  getTaskAccess,
  requireTaskScope,
  requireTaskOwner,
  listAccessibleTasks,
  canDo,
} from "@/lib/auth/task-access";
import { notifySystemEvent } from "@/lib/notifications/notify";
import { channelConfigFromForm, describeRecipient, sendTest } from "@/lib/notifications/channels";
import {
  createChannel,
  defaultChannelLabel,
  deleteChannel,
  getChannelLink,
  linkChannel,
  listChannelLinksForTask,
} from "@/lib/notifications/store";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "@/lib/notifications/channels/definitions";

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
  const runs = await db.select().from(backupRun).where(eq(backupRun.taskId, taskId)).orderBy(desc(backupRun.startedAt));
  // keyCheck stays server-side: it would let someone test password guesses
  // for an encrypted backup without having the file.
  return runs.map(({ keyCheck, ...run }) => run);
}

// One row per (run, destination) upload — used to show off-site copy
// status ("Uploaded to S3 ✓", "Failed to upload to OneDrive") in the run
// history table alongside the local file's own status. `runIds` is expected
// to come from listRuns(taskId), but this re-checks the scope itself and
// only ever returns rows for runs that actually belong to taskId — a caller
// can't use it to read another task's upload history by passing foreign ids.
//
// Only the owner gets remotePath and errorMessage: paths like
// "sftp://host/folder/file" and raw provider errors reveal the owner's
// storage setup, which people the task is shared with don't need — they
// still see each upload's status.
export async function listRunUploads(taskId: string, runIds: string[]) {
  const { access } = await requireTaskScope(taskId, "tasks:read");
  if (runIds.length === 0) return [];
  const uploads = await db
    .select({ upload: backupRunUpload })
    .from(backupRunUpload)
    .innerJoin(backupRun, eq(backupRun.id, backupRunUpload.runId))
    .where(and(eq(backupRun.taskId, taskId), inArray(backupRunUpload.runId, runIds)))
    .then((rows) => rows.map((r) => r.upload));
  return access.isOwner ? uploads : uploads.map((u) => ({ ...u, remotePath: null, errorMessage: null }));
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
    testRestoreAfterBackup: formData.get("testRestoreAfterBackup") === "on",
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

// --- Checking backup files (lib/backup/verify.ts) ---
//
// Checks only read the file (and, for a test restore, write to a throwaway
// database on the admin's scratch server), so they come with the same
// "Trigger backups" permission as running a backup. They're queued and run
// in the background; the page polls while any are pending.

export async function verifyBackupRun(taskId: string, runId: string) {
  await requireTaskScope(taskId, "runs:trigger");
  await assertRunInTask(taskId, runId);
  await enqueueVerify([runId], "check");
  revalidatePath(`/tasks/${taskId}`);
}

export async function testRestoreBackupRun(taskId: string, runId: string) {
  await requireTaskScope(taskId, "runs:trigger");
  await assertRunInTask(taskId, runId);
  const [task] = await db.select({ engine: backupTask.engine }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
  if (!task || !testRestoreAvailable(task.engine)) throw new Error("Test restores aren't set up on this server");
  await enqueueVerify([runId], "restore");
  revalidatePath(`/tasks/${taskId}`);
}

/** Checks every stored backup of the task (fingerprint + read-back, not test restores). */
export async function verifyAllBackupRuns(taskId: string) {
  await requireTaskScope(taskId, "runs:trigger");
  const runs = await db
    .select({ id: backupRun.id })
    .from(backupRun)
    .where(and(eq(backupRun.taskId, taskId), eq(backupRun.status, "completed")))
    .orderBy(desc(backupRun.startedAt));
  await enqueueVerify(runs.map((r) => r.id), "check");
  revalidatePath(`/tasks/${taskId}`);
}

/** Test-restores every stored backup of the task, one after another. */
export async function testRestoreAllBackupRuns(taskId: string) {
  await requireTaskScope(taskId, "runs:trigger");
  const [task] = await db.select({ engine: backupTask.engine }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
  if (!task || !testRestoreAvailable(task.engine)) throw new Error("Test restores aren't set up on this server");
  const runs = await db
    .select({ id: backupRun.id })
    .from(backupRun)
    .where(and(eq(backupRun.taskId, taskId), eq(backupRun.status, "completed")))
    .orderBy(desc(backupRun.startedAt));
  await enqueueVerify(runs.map((r) => r.id), "restore");
  revalidatePath(`/tasks/${taskId}`);
}

// --- Per-task notification recipients ---

export async function listTaskRecipients(taskId: string) {
  const { access } = await requireTaskScope(taskId, "tasks:read");
  const rows = await listChannelLinksForTask(taskId);
  // Push-channel config holds bot tokens / webhook URLs — only send the
  // browser a safe summary of where each recipient goes. Even that summary
  // (email address, ntfy topic, Telegram chat ID) and the channel's name
  // (often an email address) are owner-only: on a public ntfy server the
  // topic name is effectively the password.
  return rows.map(({ link, channel }) => ({
    id: link.id,
    channelLabel: NOTIFICATION_CHANNEL_DEFINITIONS[channel.channel].label,
    label: access.isOwner ? channel.label : null,
    target: access.isOwner ? describeRecipient(channel) : null,
    taskOnly: channel.taskId === taskId,
    notifyOnSuccess: link.notifyOnSuccess,
    notifyOnFailure: link.notifyOnFailure,
  }));
}

// The owner's account-level notification channels this task doesn't use
// yet. Owner-only, for the same reason as listAttachableDestinations.
export async function listAttachableChannels(taskId: string) {
  const me = await requireTaskOwner(taskId);
  const [mine, links] = await Promise.all([
    db
      .select()
      .from(notificationChannel)
      .where(and(eq(notificationChannel.ownerId, me.id), isNull(notificationChannel.taskId))),
    listChannelLinksForTask(taskId),
  ]);
  const used = new Set(links.map((l) => l.channel.id));
  return mine
    .filter((c) => !used.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, channelLabel: NOTIFICATION_CHANNEL_DEFINITIONS[c.channel].label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function attachSavedChannel(taskId: string, formData: FormData) {
  const me = await requireTaskOwner(taskId);
  const channelId = String(formData.get("channelId") ?? "");
  const [channel] = await db
    .select()
    .from(notificationChannel)
    .where(and(eq(notificationChannel.id, channelId), eq(notificationChannel.ownerId, me.id), isNull(notificationChannel.taskId)))
    .limit(1);
  if (!channel) throw new Error("Notification channel not found");
  const links = await listChannelLinksForTask(taskId);
  if (links.some((l) => l.channel.id === channel.id)) throw new Error("This task already uses that notification channel");

  await linkChannel(taskId, channel.id, formData.get("notifyOnSuccess") === "on", formData.get("notifyOnFailure") === "on");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/notification-channels");
}

// A new channel added from a task page. Owned by the task's owner; task-only
// unless the *owner* ticked "save to my account" — same rules as
// addDestination.
export async function addTaskRecipient(taskId: string, formData: FormData) {
  const { user, access } = await requireTaskScope(taskId, "tasks:write");
  const [task] = await db.select({ ownerId: backupTask.ownerId }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");
  const { channel, config } = channelConfigFromForm(formData);
  const toAccount = formData.get("saveToAccount") === "true" && access.isOwner;

  await createChannel({
    ownerId: task.ownerId,
    createdBy: user.id,
    taskOnlyFor: toAccount ? null : taskId,
    channel,
    label: String(formData.get("label") ?? "").trim() || defaultChannelLabel(channel, config),
    config,
    link: {
      taskId,
      notifyOnSuccess: formData.get("notifyOnSuccess") === "on",
      notifyOnFailure: formData.get("notifyOnFailure") === "on",
    },
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/notification-channels");
}

// Removing a task-only channel deletes it; removing an account-level one only
// stops this task using it.
export async function removeTaskRecipient(taskId: string, recipientId: string) {
  await requireTaskScope(taskId, "tasks:write");
  const row = await getChannelLink(taskId, recipientId);
  if (!row) return;
  if (row.channel.taskId === taskId) {
    await deleteChannel(row.channel.id);
  } else {
    await db.delete(taskNotificationRecipient).where(eq(taskNotificationRecipient.id, recipientId));
  }
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/notification-channels");
}

// "Send test" on the add-recipient forms (task and system). Like
// testDestinationConnection, it only needs a logged-in user since nothing
// is saved.
export async function sendTestNotification(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  await requireUser();
  try {
    const { channel, config } = channelConfigFromForm(formData);
    const detail = await sendTest(channel, config);
    return { ok: true, message: detail || undefined };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err).slice(0, 500) };
  }
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

// What the task page's "Save locations" list shows. Only the owner gets the
// per-task subfolder (it's part of where their files go — same rule as
// upload paths in listRunUploads). Credentials never leave the server.
export async function listTaskDestinations(taskId: string) {
  const { access } = await requireTaskScope(taskId, "tasks:read");
  const rows = await listLinksForTask(taskId);
  return rows.map(({ link, destination }) => ({
    linkId: link.id,
    destinationId: destination.id,
    label: destination.label,
    type: destination.type,
    enabled: link.enabled,
    taskOnly: destination.taskId === taskId,
    subfolder: access.isOwner ? link.subfolder : null,
  }));
}

// The owner's account-level save locations not yet used by this task — the
// "use a saved location" picker. Owner-only: a shared user must never see
// (or attach) the owner's other credentials, and the owner's picker never
// offers anyone else's.
export async function listAttachableDestinations(taskId: string) {
  const me = await requireTaskOwner(taskId);
  const [mine, links] = await Promise.all([
    db
      .select()
      .from(backupDestination)
      .where(and(eq(backupDestination.ownerId, me.id), isNull(backupDestination.taskId))),
    listLinksForTask(taskId),
  ]);
  const used = new Set(links.map((l) => l.destination.id));
  return mine
    .filter((d) => !used.has(d.id))
    .map((d) => ({
      id: d.id,
      label: d.label,
      type: d.type,
      supportsSubfolder: !!getDestination(d.type).subfolderField,
    }));
}

export async function attachSavedDestination(taskId: string, formData: FormData) {
  const me = await requireTaskOwner(taskId);
  const destinationId = String(formData.get("destinationId") ?? "");
  const [dest] = await db
    .select()
    .from(backupDestination)
    .where(and(eq(backupDestination.id, destinationId), eq(backupDestination.ownerId, me.id), isNull(backupDestination.taskId)))
    .limit(1);
  if (!dest) throw new Error("Save location not found");

  const subfolder = getDestination(dest.type).subfolderField ? normalizeSubfolder(String(formData.get("subfolder") ?? "")) : null;
  const links = await listLinksForTask(taskId);
  if (links.some((l) => l.destination.id === dest.id)) throw new Error("This task already uses that save location");

  await linkDestination(taskId, dest.id, subfolder);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/locations");
}

function destinationConfigFromForm(type: DestinationType, formData: FormData): Record<string, string> {
  // Only the provider's own fields — nothing else on the form (label,
  // "save to account", ...) ends up in the stored config.
  const config: Record<string, string> = {};
  for (const field of getDestination(type).configFields) {
    const value = formData.get(field.name);
    if (typeof value === "string" && value !== "") config[field.name] = value;
  }
  return config;
}

function destinationTypeFromForm(formData: FormData): DestinationType {
  const type = String(formData.get("type")) as DestinationType;
  if (!DESTINATION_TYPES.includes(type)) throw new Error(`Unsupported backup destination: ${type}`);
  return type;
}

// Who a new save location belongs to, and whether it's task-only. Shared by
// the plain add form and the sign-in (Connect) flow.
//   - From a task page: needs "Manage tasks" on it. Owned by the task's
//     owner; task-only unless the *owner* ticked "save to my account" (a
//     shared user's credentials can never become reusable by the owner).
//   - From the save locations page (taskId null): the current user's own
//     account-level location.
async function resolveNewDestinationScope(taskId: string | null, saveToAccount: boolean) {
  if (!taskId) {
    const me = await requireUser();
    return { ownerId: me.id, createdBy: me.id, taskOnlyFor: null, linkToTaskId: undefined };
  }
  const { user, access } = await requireTaskScope(taskId, "tasks:write");
  const [task] = await db.select({ ownerId: backupTask.ownerId }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");
  const toAccount = saveToAccount && access.isOwner;
  return { ownerId: task.ownerId, createdBy: user.id, taskOnlyFor: toAccount ? null : taskId, linkToTaskId: taskId };
}

function revalidateDestinationPages(taskId: string | null) {
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/locations");
}

// taskId null = adding from the save locations page (account-level).
export async function addDestination(taskId: string | null, formData: FormData) {
  const type = destinationTypeFromForm(formData);
  const scope = await resolveNewDestinationScope(taskId, formData.get("saveToAccount") === "true");
  await createDestination({
    ...scope,
    type,
    label: String(formData.get("label") || "").trim() || getDestination(type).label,
    config: destinationConfigFromForm(type, formData),
  });
  revalidateDestinationPages(taskId);
}

// Standalone check used by the "add destination" form before saving, same
// role as testConnection() plays for the database connection fields above.
// No taskId yet at this point (the destination isn't saved), so this only
// requires being logged in, not any particular task permission.
export async function testDestinationConnection(formData: FormData) {
  await requireUser();
  const type = destinationTypeFromForm(formData);
  return getDestination(type).testConnection(destinationConfigFromForm(type, formData));
}

export async function toggleTaskDestinationEnabled(taskId: string, linkId: string, enabled: boolean) {
  await requireTaskScope(taskId, "tasks:write");
  await db
    .update(taskDestination)
    .set({ enabled })
    .where(and(eq(taskDestination.id, linkId), eq(taskDestination.taskId, taskId)));
  revalidatePath(`/tasks/${taskId}`);
}

// Removing a task-only location deletes it; removing an account-level one
// only stops this task using it — it stays saved for the owner's other tasks.
export async function removeTaskDestination(taskId: string, linkId: string) {
  await requireTaskScope(taskId, "tasks:write");
  const row = await getLink(taskId, linkId);
  if (!row) return;
  if (row.destination.taskId === taskId) {
    await deleteDestination(row.destination.id);
  } else {
    await db.delete(taskDestination).where(eq(taskDestination.id, linkId));
  }
  revalidateDestinationPages(taskId);
}

// Re-runs testConnection with a destination's already-saved (encrypted)
// config, as this task would use it (subfolder included) — used by the
// "Test" button next to an existing destination, as opposed to the one on
// the add-destination form which tests in-progress, unsaved values.
export async function testExistingTaskDestination(taskId: string, linkId: string) {
  const { access } = await requireTaskScope(taskId, "tasks:write");
  const row = await getLink(taskId, linkId);
  if (!row) return { ok: false as const, message: "Destination not found." };

  const config = readConfig(row.destination);
  const result = await getDestination(row.destination.type).testConnection(
    configForLink(row.destination, config, row.link.subfolder),
    persistingRuntime(row.destination, config)
  );
  // Test messages and errors can name hosts, folders and SFTP fingerprints —
  // shared managers only get pass/fail.
  if (access.isOwner) return result;
  return result.ok
    ? { ok: true }
    : { ok: false, message: "connection failed (details are only shown to the task owner)" };
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
//
// taskId null = connecting from the save locations page (account-level).

const CONNECT_TOKEN_TTL_BUFFER_MS = 10_000;

export async function startDestinationConnect(taskId: string | null, type: DestinationType) {
  if (taskId) await requireTaskScope(taskId, "tasks:write");
  const me = await requireUser();
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
        userId: me.id,
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
  taskId: string | null,
  token: string,
  label: string,
  extra: Record<string, string>,
  saveToAccount: boolean
): Promise<
  | { status: "pending"; slowDown?: boolean }
  | { status: "complete"; account?: string }
  | { status: "error"; message: string }
> {
  if (taskId) await requireTaskScope(taskId, "tasks:write");
  const me = await requireUser();

  let payload: { type: DestinationType; taskId: string | null; userId: string; state: Record<string, string>; expiresAt: number };
  try {
    payload = JSON.parse(unwrapSecret(token));
  } catch {
    return { status: "error", message: "Invalid or tampered sign-in session. Please start again." };
  }
  if (payload.taskId !== taskId || payload.userId !== me.id) {
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

  const scope = await resolveNewDestinationScope(taskId, saveToAccount);
  await createDestination({
    ...scope,
    type: payload.type,
    label: label.trim() || (result.account ? `${destination.label} (${result.account})` : destination.label),
    config,
  });
  revalidateDestinationPages(taskId);

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
