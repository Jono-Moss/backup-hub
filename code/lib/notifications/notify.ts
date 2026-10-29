import { db } from "@/db";
import {
  systemNotificationRecipient,
  backupTask,
  type SystemNotificationEvent,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { deliver } from "./channels";
import { listChannelLinksForTask } from "./store";
import { formatBytes } from "./notifyUtils";

export async function notifyTaskSuccess(taskId: string, filename: string, sizeBytes: number) {
  const [task, recipients] = await Promise.all([
    db.select({ name: backupTask.name }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1),
    listChannelLinksForTask(taskId),
  ]);
  const taskName = task[0]?.name ?? taskId;
  const mb = formatBytes(sizeBytes)

  await Promise.all(
    recipients
      .filter((r) => r.link.notifyOnSuccess)
      .map((r) =>
        deliver(r.channel, {
          title: `Backup succeeded: ${taskName}`,
          body: `The backup task "${taskName}" completed successfully.\n\nFile: ${filename}\nSize: ${mb}`,
          level: "success",
        })
      )
  );
}

export async function notifyTaskFailure(taskId: string, errorMessage: string) {
  const [task, recipients] = await Promise.all([
    db.select({ name: backupTask.name }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1),
    listChannelLinksForTask(taskId),
  ]);
  const taskName = task[0]?.name ?? taskId;

  await Promise.all(
    recipients
      .filter((r) => r.link.notifyOnFailure)
      .map((r) =>
        deliver(r.channel, {
          title: `Backup failed: ${taskName}`,
          body: `The backup task "${taskName}" failed.\n\nError: ${errorMessage}`,
          level: "failure",
        })
      )
  );
}

// An automatic check of a backup (after it was made, or its test restore)
// failed. Goes to the same recipients as failed backups — the backup exists,
// but it may not be usable.
export async function notifyVerifyFailure(taskId: string, filename: string, problem: string) {
  const [task, recipients] = await Promise.all([
    db.select({ name: backupTask.name }).from(backupTask).where(eq(backupTask.id, taskId)).limit(1),
    listChannelLinksForTask(taskId),
  ]);
  const taskName = task[0]?.name ?? taskId;

  await Promise.all(
    recipients
      .filter((r) => r.link.notifyOnFailure)
      .map((r) =>
        deliver(r.channel, {
          title: `Backup check failed: ${taskName}`,
          body: `A backup of "${taskName}" didn't pass its check, so it may not be usable.\n\nFile: ${filename}\nProblem: ${problem}`,
          level: "failure",
        })
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
    subscribed.map((r) => deliver(r, { title: `Backup Hub: ${subjects[event]}`, body: message, level: "info" }))
  );
}
