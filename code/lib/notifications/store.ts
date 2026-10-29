import { db } from "@/db";
import { notificationChannel, taskNotificationRecipient, type NotificationChannel } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { channelColumns, configOf } from "./channels";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "./channels/definitions";
import type { ChannelConfig } from "./channels/types";

// Database-side helpers for saved notification channels (notification_channel)
// and the task links that use them (task_notification_recipient). Same model
// as lib/backup/destinations/store.ts. No permission checks here — callers
// are responsible for those.

export type ChannelRow = typeof notificationChannel.$inferSelect;

export async function createChannel(opts: {
  ownerId: string;
  createdBy: string;
  /** Set for a task-only channel, null for an account-level one. */
  taskOnlyFor: string | null;
  channel: NotificationChannel;
  label: string;
  config: ChannelConfig;
  link?: { taskId: string; notifyOnSuccess: boolean; notifyOnFailure: boolean };
}): Promise<string> {
  const id = uuid();
  await db.insert(notificationChannel).values({
    id,
    ownerId: opts.ownerId,
    createdBy: opts.createdBy,
    taskId: opts.taskOnlyFor,
    label: opts.label,
    ...channelColumns(opts.channel, opts.config),
  });
  if (opts.link) await linkChannel(opts.link.taskId, id, opts.link.notifyOnSuccess, opts.link.notifyOnFailure);
  return id;
}

export async function linkChannel(taskId: string, channelId: string, notifyOnSuccess: boolean, notifyOnFailure: boolean) {
  await db.insert(taskNotificationRecipient).values({ id: uuid(), taskId, channelId, notifyOnSuccess, notifyOnFailure });
}

/** Default name for a new channel when the user doesn't give one. */
export function defaultChannelLabel(channel: NotificationChannel, config: ChannelConfig): string {
  if (channel === "email") return config.email;
  if (channel === "ntfy" && config.topic) return `ntfy ${config.topic}`;
  return NOTIFICATION_CHANNEL_DEFINITIONS[channel].label;
}

export async function deleteChannel(channelId: string) {
  await db.delete(taskNotificationRecipient).where(eq(taskNotificationRecipient.channelId, channelId));
  await db.delete(notificationChannel).where(eq(notificationChannel.id, channelId));
}

/** For deleting a task: its links, plus its task-only channels. */
export async function deleteChannelsForTask(taskId: string) {
  await db.delete(taskNotificationRecipient).where(eq(taskNotificationRecipient.taskId, taskId));
  const taskOnly = await db.select({ id: notificationChannel.id }).from(notificationChannel).where(eq(notificationChannel.taskId, taskId));
  if (taskOnly.length > 0) {
    const ids = taskOnly.map((c) => c.id);
    await db.delete(taskNotificationRecipient).where(inArray(taskNotificationRecipient.channelId, ids));
    await db.delete(notificationChannel).where(inArray(notificationChannel.id, ids));
  }
}

/** A user's remaining (account-level) channels and their links — their tasks are purged separately. */
export async function deleteAccountChannelsOf(userId: string) {
  const owned = await db.select({ id: notificationChannel.id }).from(notificationChannel).where(eq(notificationChannel.ownerId, userId));
  for (const c of owned) await deleteChannel(c.id);
}

/** A task's recipients, joined with their channels. */
export async function listChannelLinksForTask(taskId: string) {
  return db
    .select({ link: taskNotificationRecipient, channel: notificationChannel })
    .from(taskNotificationRecipient)
    .innerJoin(notificationChannel, eq(notificationChannel.id, taskNotificationRecipient.channelId))
    .where(eq(taskNotificationRecipient.taskId, taskId));
}

export async function getChannelLink(taskId: string, linkId: string) {
  const [row] = await db
    .select({ link: taskNotificationRecipient, channel: notificationChannel })
    .from(taskNotificationRecipient)
    .innerJoin(notificationChannel, eq(notificationChannel.id, taskNotificationRecipient.channelId))
    .where(and(eq(taskNotificationRecipient.id, linkId), eq(taskNotificationRecipient.taskId, taskId)))
    .limit(1);
  return row ?? null;
}

// Password-type fields (tokens, webhook URLs) are secret: never sent back to
// the browser, and blank on edit means "keep the current value".
function isSecret(field: { type: string }) {
  return field.type === "password";
}

/** Non-secret settings to pre-fill the edit form with, plus which secrets are set. */
export function editableChannelConfig(row: ChannelRow): { values: ChannelConfig; secretsSet: string[] } {
  const config = configOf(row);
  const values: ChannelConfig = {};
  const secretsSet: string[] = [];
  for (const field of NOTIFICATION_CHANNEL_DEFINITIONS[row.channel].fields) {
    if (isSecret(field)) {
      if (config[field.name]) secretsSet.push(field.name);
    } else if (config[field.name] !== undefined) {
      values[field.name] = config[field.name];
    }
  }
  return { values, secretsSet };
}

/** The config after an edit: submitted values, with blank secrets keeping their saved value. */
export function mergeEditedChannelConfig(row: ChannelRow, formData: FormData): ChannelConfig {
  const current = configOf(row);
  const next: ChannelConfig = {};
  for (const field of NOTIFICATION_CHANNEL_DEFINITIONS[row.channel].fields) {
    const value = String(formData.get(field.name) ?? "").trim();
    const kept = isSecret(field) && value === "" ? current[field.name] : value;
    if (kept) next[field.name] = kept;
    else if (field.required) throw new Error(`${field.label} is required`);
  }
  return next;
}
