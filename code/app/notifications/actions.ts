"use server";

import { db } from "@/db";
import { systemNotificationRecipient, SYSTEM_NOTIFICATION_EVENTS, type SystemNotificationEvent } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { requireAdmin } from "@/lib/auth/session";
import { describeRecipient, recipientColumnsFromForm } from "@/lib/notifications/channels";

export async function listSystemRecipients() {
  await requireAdmin();
  const rows = await db.select().from(systemNotificationRecipient);
  return rows.map(({ encryptedConfig, email, ...rest }) => ({
    ...rest,
    target: describeRecipient({ channel: rest.channel, email, encryptedConfig }),
  }));
}

export async function addSystemRecipient(formData: FormData) {
  await requireAdmin();
  const events = formData.getAll("events") as SystemNotificationEvent[];

  if (events.length === 0) {
    throw new Error("At least one event is required");
  }

  await db.insert(systemNotificationRecipient).values({ id: uuid(), ...recipientColumnsFromForm(formData), events });
  revalidatePath("/notifications");
}

export async function removeSystemRecipient(id: string) {
  await requireAdmin();
  await db.delete(systemNotificationRecipient).where(eq(systemNotificationRecipient.id, id));
  revalidatePath("/notifications");
}
