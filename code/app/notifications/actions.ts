"use server";

import { db } from "@/db";
import { systemNotificationRecipient, SYSTEM_NOTIFICATION_EVENTS, type SystemNotificationEvent } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { requireAdmin } from "@/lib/auth/session";

export async function listSystemRecipients() {
  await requireAdmin();
  return db.select().from(systemNotificationRecipient);
}

export async function addSystemRecipient(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const events = formData.getAll("events") as SystemNotificationEvent[];

  if (!email || events.length === 0) {
    throw new Error("Email and at least one event are required");
  }

  await db.insert(systemNotificationRecipient).values({ id: uuid(), email, events });
  revalidatePath("/notifications");
}

export async function removeSystemRecipient(id: string) {
  await requireAdmin();
  await db.delete(systemNotificationRecipient).where(eq(systemNotificationRecipient.id, id));
  revalidatePath("/notifications");
}
