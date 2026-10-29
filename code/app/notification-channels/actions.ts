"use server";

import { db } from "@/db";
import { notificationChannel, taskNotificationRecipient, backupTask, appUser } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  channelColumns,
  channelConfigFromForm,
  configOf,
  describeRecipient,
  sendTest,
} from "@/lib/notifications/channels";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "@/lib/notifications/channels/definitions";
import {
  createChannel,
  defaultChannelLabel,
  deleteChannel,
  editableChannelConfig,
  mergeEditedChannelConfig,
} from "@/lib/notifications/store";

// The "Notification channels" page: every channel the current user owns —
// account-level ones (reusable across their tasks) and task-only ones on
// their tasks. Same rules as app/locations/actions.ts.

async function requireOwnedChannel(id: string) {
  const me = await requireUser();
  const [channel] = await db
    .select()
    .from(notificationChannel)
    .where(and(eq(notificationChannel.id, id), eq(notificationChannel.ownerId, me.id)))
    .limit(1);
  if (!channel) throw new Error("Notification channel not found");
  return { me, channel };
}

// Editing, or making a task-only channel reusable, also requires having
// entered its settings yourself (see requireOwnCredentials in app/locations).
async function requireOwnSettings(id: string) {
  const { me, channel } = await requireOwnedChannel(id);
  if (channel.createdBy !== me.id) throw new Error("Only the person who added this channel can change it");
  return { me, channel };
}

function testResult(err: unknown) {
  return { ok: false, message: String(err instanceof Error ? err.message : err).slice(0, 500) };
}

export async function listMyChannels() {
  const me = await requireUser();
  const channels = await db.select().from(notificationChannel).where(eq(notificationChannel.ownerId, me.id));
  if (channels.length === 0) return [];

  const ids = channels.map((c) => c.id);
  const [links, creators] = await Promise.all([
    db
      .select({ channelId: taskNotificationRecipient.channelId, taskId: backupTask.id, taskName: backupTask.name })
      .from(taskNotificationRecipient)
      .innerJoin(backupTask, eq(backupTask.id, taskNotificationRecipient.taskId))
      .where(inArray(taskNotificationRecipient.channelId, ids)),
    db
      .select({ id: appUser.id, name: appUser.name })
      .from(appUser)
      .where(inArray(appUser.id, [...new Set(channels.map((c) => c.createdBy))])),
  ]);
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));

  return channels
    .map((c) => ({
      id: c.id,
      label: c.label,
      channelLabel: NOTIFICATION_CHANNEL_DEFINITIONS[c.channel].label,
      target: describeRecipient(c),
      taskOnly: c.taskId !== null,
      usedBy: links.filter((l) => l.channelId === c.id).map((l) => ({ id: l.taskId, name: l.taskName })),
      addedByMe: c.createdBy === me.id,
      addedByName: c.createdBy === me.id ? null : creatorName.get(c.createdBy) ?? "a deleted user",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function addAccountChannel(formData: FormData) {
  const me = await requireUser();
  const { channel, config } = channelConfigFromForm(formData);
  await createChannel({
    ownerId: me.id,
    createdBy: me.id,
    taskOnlyFor: null,
    channel,
    label: String(formData.get("label") ?? "").trim() || defaultChannelLabel(channel, config),
    config,
  });
  revalidatePath("/notification-channels");
}

export async function getChannelForEdit(id: string) {
  const { channel } = await requireOwnSettings(id);
  const { values, secretsSet } = editableChannelConfig(channel);
  return { id: channel.id, label: channel.label, channel: channel.channel, taskOnly: channel.taskId !== null, values, secretsSet };
}

export async function updateChannel(id: string, formData: FormData) {
  const { channel } = await requireOwnSettings(id);
  const config = mergeEditedChannelConfig(channel, formData);
  const { email, encryptedConfig } = channelColumns(channel.channel, config);
  await db
    .update(notificationChannel)
    .set({ label: String(formData.get("label") ?? "").trim() || channel.label, email, encryptedConfig })
    .where(eq(notificationChannel.id, channel.id));
  await revalidateFor(channel.id);
}

// Sends a test with the edit form's values (blank secrets = the saved ones).
export async function testEditedChannel(id: string, formData: FormData) {
  const { channel } = await requireOwnSettings(id);
  try {
    const detail = await sendTest(channel.channel, mergeEditedChannelConfig(channel, formData));
    return { ok: true, message: detail || undefined };
  } catch (err) {
    return testResult(err);
  }
}

export async function testChannel(id: string) {
  const { channel } = await requireOwnedChannel(id);
  try {
    const detail = await sendTest(channel.channel, configOf(channel));
    return { ok: true, message: detail || undefined };
  } catch (err) {
    return testResult(err);
  }
}

export async function deleteChannelById(id: string) {
  const { channel } = await requireOwnedChannel(id);
  const taskIds = await linkedTaskIds(channel.id);
  await deleteChannel(channel.id);
  for (const taskId of taskIds) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/notification-channels");
}

// Task-only → account-level. One way only.
export async function makeChannelReusable(id: string) {
  const { channel } = await requireOwnSettings(id);
  if (channel.taskId === null) return;
  await db.update(notificationChannel).set({ taskId: null }).where(eq(notificationChannel.id, channel.id));
  await revalidateFor(channel.id);
}

async function linkedTaskIds(channelId: string) {
  const rows = await db
    .select({ taskId: taskNotificationRecipient.taskId })
    .from(taskNotificationRecipient)
    .where(eq(taskNotificationRecipient.channelId, channelId));
  return rows.map((r) => r.taskId);
}

async function revalidateFor(channelId: string) {
  for (const taskId of await linkedTaskIds(channelId)) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/notification-channels");
}
