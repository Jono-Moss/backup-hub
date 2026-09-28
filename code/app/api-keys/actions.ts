"use server";

import { db } from "@/db";
import { apiKey, SCOPES, type Scope } from "@/db/schema";
import { eq, isNull, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { generateApiKey } from "@/lib/backup/crypto";
import { requireUser } from "@/lib/auth/session";
import { getTaskAccess, listAccessibleTasks } from "@/lib/auth/task-access";

// API keys belong to the user who created them; everyone (admins included)
// only ever sees and manages their own.
export async function listApiKeys() {
  const me = await requireUser();
  return db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.userId, me.id), isNull(apiKey.revokedAt)))
    .orderBy(desc(apiKey.createdAt));
}

// Tasks the user can pin a key to: ones they own or that are shared with them.
export async function listTasksForPicker() {
  const me = await requireUser();
  const tasks = await listAccessibleTasks(me.id);
  return tasks.map((t) => ({ id: t.id, name: t.name }));
}

// Returns the raw key exactly once — the caller (page) must show it to the
// user immediately, since only the hash is persisted after this.
//
// The key acts as its creator: on any task it can only do what its scopes
// AND the creator's own permission on that task allow.
export async function createApiKey(formData: FormData) {
  const me = await requireUser();
  const name = String(formData.get("name"));
  const taskId = String(formData.get("taskId") || "") || null;
  const scopes = formData.getAll("scopes").map(String).filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));

  if (!name || scopes.length === 0) {
    throw new Error("Name and at least one scope are required");
  }
  if (taskId && !(await getTaskAccess(me.id, taskId))) {
    throw new Error("Task not found");
  }

  const { raw, hashed, prefix } = generateApiKey();

  await db.insert(apiKey).values({
    id: uuid(),
    userId: me.id,
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
  const me = await requireUser();
  await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, me.id)));
  revalidatePath("/api-keys");
}
