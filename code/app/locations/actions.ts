"use server";

import { db } from "@/db";
import { backupDestination, backupTask, taskDestination, appUser } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getDestination } from "@/lib/backup/destinations";
import { wrapDestinationConfig } from "@/lib/backup/crypto";
import {
  deleteDestination,
  editableConfig,
  mergeEditedConfig,
  persistingRuntime,
  readConfig,
  type DestinationRow,
} from "@/lib/backup/destinations/store";

// The "Save locations" page: every save location the current user owns —
// account-level ones (reusable across their tasks) and task-only ones on
// their tasks. Everything here is scoped to ownerId = me; nobody, admins
// included, can see or manage another user's locations.

async function requireOwnedDestination(id: string) {
  const me = await requireUser();
  const [dest] = await db
    .select()
    .from(backupDestination)
    .where(and(eq(backupDestination.id, id), eq(backupDestination.ownerId, me.id)))
    .limit(1);
  if (!dest) throw new Error("Save location not found");
  return { me, dest };
}

// Editing, or making a task-only location reusable, also requires having
// entered the credentials yourself. A task-only location a shared user added
// to your task belongs to you (so you can remove it), but its credentials are
// theirs: you can't repoint them at another server or reuse them elsewhere.
async function requireOwnCredentials(id: string) {
  const { me, dest } = await requireOwnedDestination(id);
  if (dest.createdBy !== me.id) throw new Error("Only the person who added this save location can change it");
  return { me, dest };
}

export async function listMyLocations() {
  const me = await requireUser();
  const destinations = await db.select().from(backupDestination).where(eq(backupDestination.ownerId, me.id));
  if (destinations.length === 0) return [];

  const ids = destinations.map((d) => d.id);
  const [links, creators] = await Promise.all([
    db
      .select({ destinationId: taskDestination.destinationId, taskId: backupTask.id, taskName: backupTask.name })
      .from(taskDestination)
      .innerJoin(backupTask, eq(backupTask.id, taskDestination.taskId))
      .where(inArray(taskDestination.destinationId, ids)),
    db
      .select({ id: appUser.id, name: appUser.name })
      .from(appUser)
      .where(inArray(appUser.id, [...new Set(destinations.map((d) => d.createdBy))])),
  ]);
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));

  return destinations
    .map((d) => ({
      id: d.id,
      label: d.label,
      type: d.type,
      typeLabel: getDestination(d.type).label,
      taskOnly: d.taskId !== null,
      usedBy: links.filter((l) => l.destinationId === d.id).map((l) => ({ id: l.taskId, name: l.taskName })),
      addedByMe: d.createdBy === me.id,
      addedByName: d.createdBy === me.id ? null : creatorName.get(d.createdBy) ?? "a deleted user",
      createdAt: d.createdAt,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getLocationForEdit(id: string) {
  const { dest } = await requireOwnCredentials(id);
  const { values, secretsSet } = editableConfig(dest);
  return { id: dest.id, label: dest.label, type: dest.type, taskOnly: dest.taskId !== null, values, secretsSet };
}

export async function updateLocation(id: string, formData: FormData) {
  const { dest } = await requireOwnCredentials(id);
  const config = mergeEditedConfig(dest, readConfig(dest), formData);
  await db
    .update(backupDestination)
    .set({
      label: String(formData.get("label") || "").trim() || dest.label,
      encryptedConfig: wrapDestinationConfig(config),
    })
    .where(eq(backupDestination.id, dest.id));
  await revalidateFor(dest);
}

// Tests the edit form's values (blank secrets = the saved ones) without
// saving, so a changed host/password can be checked first.
export async function testEditedLocation(id: string, formData: FormData) {
  const { dest } = await requireOwnCredentials(id);
  const config = mergeEditedConfig(dest, readConfig(dest), formData);
  return getDestination(dest.type).testConnection(config);
}

export async function testLocation(id: string) {
  const { dest } = await requireOwnedDestination(id);
  const config = readConfig(dest);
  return getDestination(dest.type).testConnection(config, persistingRuntime(dest, config));
}

export async function deleteLocation(id: string) {
  const { dest } = await requireOwnedDestination(id);
  const taskIds = await linkedTaskIds(dest.id);
  await deleteDestination(dest.id);
  for (const taskId of taskIds) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/locations");
}

// Task-only → account-level. One way only: once reusable, other tasks may
// already depend on it.
export async function makeLocationReusable(id: string) {
  const { dest } = await requireOwnCredentials(id);
  if (dest.taskId === null) return;
  await db.update(backupDestination).set({ taskId: null }).where(eq(backupDestination.id, dest.id));
  await revalidateFor(dest);
}

async function linkedTaskIds(destinationId: string) {
  const rows = await db
    .select({ taskId: taskDestination.taskId })
    .from(taskDestination)
    .where(eq(taskDestination.destinationId, destinationId));
  return rows.map((r) => r.taskId);
}

async function revalidateFor(dest: DestinationRow) {
  for (const taskId of await linkedTaskIds(dest.id)) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/locations");
}
