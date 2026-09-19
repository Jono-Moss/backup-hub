"use server";

import { db } from "@/db";
import { apiKey, backupTask, type Scope } from "@/db/schema";
import { eq, isNull, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { generateApiKey } from "@/lib/backup/crypto";

export async function listApiKeys() {
  return db.select().from(apiKey).where(isNull(apiKey.revokedAt)).orderBy(desc(apiKey.createdAt));
}

export async function listTasksForPicker() {
  return db.select({ id: backupTask.id, name: backupTask.name }).from(backupTask);
}

// Returns the raw key exactly once — the caller (page) must show it to the
// user immediately, since only the hash is persisted after this.
export async function createApiKey(formData: FormData) {
  const name = String(formData.get("name"));
  const taskId = String(formData.get("taskId") || "") || null;
  const scopes = formData.getAll("scopes") as Scope[];

  if (!name || scopes.length === 0) {
    throw new Error("Name and at least one scope are required");
  }

  const { raw, hashed, prefix } = generateApiKey();

  await db.insert(apiKey).values({
    id: uuid(),
    name,
    hashedKey: hashed,
    keyPrefix: prefix,
    scopes,
    taskId,
  });

  revalidatePath("/api-keys");
  return raw;
}

export async function revokeApiKey(id: string) {
  await db.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, id));
  revalidatePath("/api-keys");
}
