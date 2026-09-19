import { db } from "@/db";
import {
  taskNotificationRecipient,
  systemNotificationRecipient,
  backupTask,
  type SystemNotificationEvent,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "./mailer";

export async function notifyTaskSuccess(taskId: string, filename: string, sizeBytes: number) {
  const [task, recipients] = await Promise.all([
    db.select({ name: backupTask.name }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1),
    db.select().from(taskNotificationRecipient).where(eq(taskNotificationRecipient.taskId, taskId)),
  ]);
  const taskName = task[0]?.name ?? taskId;
  const mb = (sizeBytes / 1024 / 1024).toFixed(1);

  await Promise.all(
    recipients
      .filter((r) => r.notifyOnSuccess)
      .map((r) =>
        sendMail(
          r.email,
          `Backup succeeded: ${taskName}`,
          `The backup task "${taskName}" completed successfully.\n\nFile: ${filename}\nSize: ${mb} MB`
        )
      )
  );
}

export async function notifyTaskFailure(taskId: string, errorMessage: string) {
  const [task, recipients] = await Promise.all([
    db.select({ name: backupTask.name }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1),
    db.select().from(taskNotificationRecipient).where(eq(taskNotificationRecipient.taskId, taskId)),
  ]);
  const taskName = task[0]?.name ?? taskId;

  await Promise.all(
    recipients
      .filter((r) => r.notifyOnFailure)
      .map((r) =>
        sendMail(
          r.email,
          `Backup failed: ${taskName}`,
          `The backup task "${taskName}" failed.\n\nError: ${errorMessage}`
        )
      )
  );
}

export async function notifySystemEvent(event: SystemNotificationEvent, message: string) {
  const recipients = await db.select().from(systemNotificationRecipient);
  const subscribed = recipients.filter((r) => r.events.includes(event));

  const subjects: Record<SystemNotificationEvent, string> = {
    user_login: "User login",
    user_created: "User created",
    user_deleted: "User deleted",
    task_created: "Backup task created",
    task_deleted: "Backup task deleted",
    security_reset: "Two-factor/passkeys reset",
  };

  await Promise.all(
    subscribed.map((r) => sendMail(r.email, `Backup Hub: ${subjects[event]}`, message))
  );
}
