import { db } from "@/db";
import { backupDestination, taskDestination, type DestinationType } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { wrapDestinationConfig, unwrapDestinationConfig } from "@/lib/backup/crypto";
import { getDestination } from "./index";
import { isSecretField, type DestinationConfig, type DestinationRuntime } from "./types";

// Database-side helpers for saved locations (backup_destination) and the
// task links that use them (task_destination). No permission checks here —
// callers (server actions, the runner, purge) are responsible for those.

export type DestinationRow = typeof backupDestination.$inferSelect;

/** Saves a new destination and, when `linkToTaskId` is given, attaches it to that task. */
export async function createDestination(opts: {
  ownerId: string;
  createdBy: string;
  /** Set for a task-only destination, null for an account-level one. */
  taskOnlyFor: string | null;
  type: DestinationType;
  label: string;
  config: DestinationConfig;
  linkToTaskId?: string;
}): Promise<string> {
  const id = uuid();
  await db.insert(backupDestination).values({
    id,
    ownerId: opts.ownerId,
    createdBy: opts.createdBy,
    taskId: opts.taskOnlyFor,
    type: opts.type,
    label: opts.label,
    encryptedConfig: wrapDestinationConfig(opts.config),
  });
  if (opts.linkToTaskId) await linkDestination(opts.linkToTaskId, id, null);
  return id;
}

export async function linkDestination(taskId: string, destinationId: string, subfolder: string | null) {
  await db.insert(taskDestination).values({ id: uuid(), taskId, destinationId, subfolder });
}

/** Deletes a destination and every task link to it. Upload history keeps its label snapshot. */
export async function deleteDestination(destinationId: string) {
  await db.delete(taskDestination).where(eq(taskDestination.destinationId, destinationId));
  await db.delete(backupDestination).where(eq(backupDestination.id, destinationId));
}

/** Everything a task-deletion needs to clean up: its links, plus its task-only destinations. */
export async function deleteDestinationsForTask(taskId: string) {
  await db.delete(taskDestination).where(eq(taskDestination.taskId, taskId));
  const taskOnly = await db.select({ id: backupDestination.id }).from(backupDestination).where(eq(backupDestination.taskId, taskId));
  if (taskOnly.length > 0) {
    const ids = taskOnly.map((d) => d.id);
    // Belt and braces: a task-only destination should never be linked anywhere else.
    await db.delete(taskDestination).where(inArray(taskDestination.destinationId, ids));
    await db.delete(backupDestination).where(inArray(backupDestination.id, ids));
  }
}

/** A user's account-level destinations and their links (their tasks are purged separately). */
export async function deleteAccountDestinationsOf(userId: string) {
  const owned = await db
    .select({ id: backupDestination.id })
    .from(backupDestination)
    .where(eq(backupDestination.ownerId, userId));
  for (const d of owned) await deleteDestination(d.id);
}

export function readConfig(dest: DestinationRow): DestinationConfig {
  const config = unwrapDestinationConfig(dest.encryptedConfig);
  // The add form's checkboxes used to submit the browser default "on", but
  // providers check for "true" — so those options were silently ignored.
  // Normalise rows saved before that was fixed.
  for (const field of getDestination(dest.type).configFields) {
    if (field.type === "checkbox" && config[field.name] === "on") config[field.name] = "true";
  }
  return config;
}

/** Runtime that persists config changes (e.g. OneDrive's rotating refresh token) back to the destination. */
export function persistingRuntime(dest: DestinationRow, config: DestinationConfig): DestinationRuntime {
  return {
    updateConfig: async (patch) => {
      // Re-read so a concurrent upload from another task sharing this
      // destination doesn't get its own rotated token overwritten with a
      // stale copy of the rest of the config.
      const [current] = await db.select().from(backupDestination).where(eq(backupDestination.id, dest.id)).limit(1);
      const merged = { ...(current ? readConfig(current) : config), ...patch };
      Object.assign(config, patch);
      await db
        .update(backupDestination)
        .set({ encryptedConfig: wrapDestinationConfig(merged) })
        .where(eq(backupDestination.id, dest.id));
    },
  };
}

/**
 * Cleans a user-entered per-task subfolder: trims slashes and whitespace,
 * and rejects "." / ".." segments so a task can't climb out of the
 * destination's own folder. Returns null for blank.
 */
export function normalizeSubfolder(input: string | null | undefined): string | null {
  const parts = String(input ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) throw new Error('Subfolder can\'t contain "." or ".." segments.');
  const joined = parts.join("/");
  if (joined.length > 512) throw new Error("Subfolder is too long.");
  return joined || null;
}

/** The destination's config with a task link's subfolder appended to its folder field. */
export function configForLink(dest: DestinationRow, config: DestinationConfig, subfolder: string | null): DestinationConfig {
  const field = getDestination(dest.type).subfolderField;
  if (!field || !subfolder) return config;
  // Keep a leading "/" on the base (absolute FTP/SFTP paths), drop trailing ones.
  const base = (config[field] || "").trim().replace(/\/+$/, "");
  return { ...config, [field]: base ? `${base}/${subfolder}` : subfolder };
}

/** Links for a task, joined with their destinations. */
export async function listLinksForTask(taskId: string) {
  return db
    .select({ link: taskDestination, destination: backupDestination })
    .from(taskDestination)
    .innerJoin(backupDestination, eq(backupDestination.id, taskDestination.destinationId))
    .where(eq(taskDestination.taskId, taskId));
}

export async function getLink(taskId: string, linkId: string) {
  const [row] = await db
    .select({ link: taskDestination, destination: backupDestination })
    .from(taskDestination)
    .innerJoin(backupDestination, eq(backupDestination.id, taskDestination.destinationId))
    .where(and(eq(taskDestination.id, linkId), eq(taskDestination.taskId, taskId)))
    .limit(1);
  return row ?? null;
}

/**
 * Builds the new config for an edit: non-secret fields take the submitted
 * value; secret fields left blank keep their current value (they're never
 * sent to the browser, so blank means "unchanged").
 */
export function mergeEditedConfig(dest: DestinationRow, current: DestinationConfig, formData: FormData): DestinationConfig {
  const next: DestinationConfig = { ...current };
  for (const field of getDestination(dest.type).configFields) {
    const raw = formData.get(field.name);
    const value = typeof raw === "string" ? raw : "";
    if (field.type === "checkbox") {
      if (raw === null) delete next[field.name];
      else next[field.name] = "true";
    } else if (isSecretField(field)) {
      if (value !== "") next[field.name] = value;
    } else if (value === "") {
      delete next[field.name];
    } else {
      next[field.name] = value;
    }
  }
  return next;
}

/** The non-secret part of a config, safe to pre-fill an edit form with, plus which secrets are set. */
export function editableConfig(dest: DestinationRow): { values: DestinationConfig; secretsSet: string[] } {
  const config = readConfig(dest);
  const values: DestinationConfig = {};
  const secretsSet: string[] = [];
  for (const field of getDestination(dest.type).configFields) {
    if (isSecretField(field)) {
      if (config[field.name]) secretsSet.push(field.name);
    } else if (config[field.name] !== undefined) {
      values[field.name] = config[field.name];
    }
  }
  return { values, secretsSet };
}
