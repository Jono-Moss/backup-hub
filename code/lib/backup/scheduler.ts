import cron, { type ScheduledTask } from "node-cron";
import { db } from "@/db";
import { backupTask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runBackupForTask } from "@/lib/backup/runner";

// One node-cron job per enabled task, keyed by task id, so tasks can be
// individually rescheduled/stopped without touching the others.
const activeJobs = new Map<string, ScheduledTask>();

export async function scheduleAllTasks() {
  const tasks = await db.select().from(backupTask).where(eq(backupTask.enabled, true));
  for (const task of tasks) {
    scheduleTask(task.id, task.cronExpression);
  }
  console.log(`[scheduler] scheduled ${tasks.length} task(s)`);
}

export function scheduleTask(taskId: string, cronExpression: string) {
  unscheduleTask(taskId);

  if (!cron.validate(cronExpression)) {
    console.error(`[scheduler] invalid cron "${cronExpression}" for task ${taskId}, skipping`);
    return;
  }

  const job = cron.schedule(cronExpression, () => {
    runBackupForTask(taskId, "cron").catch((err) =>
      console.error(`[scheduler] backup failed for task ${taskId}:`, err.message)
    );
  });

  activeJobs.set(taskId, job);
}

export function unscheduleTask(taskId: string) {
  const existing = activeJobs.get(taskId);
  if (existing) {
    existing.stop();
    activeJobs.delete(taskId);
  }
}

// Call this after any create/update/delete/enable/disable of a task so the
// in-memory schedule stays in sync with the database.
export async function resyncTask(taskId: string) {
  const [task] = await db.select().from(backupTask).where(eq(backupTask.id, taskId)).limit(1);
  if (!task || !task.enabled) {
    unscheduleTask(taskId);
    return;
  }
  scheduleTask(task.id, task.cronExpression);
}
