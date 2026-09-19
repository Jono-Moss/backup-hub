// Next.js calls register() once when the server process starts.
// This is where we boot the in-process cron scheduler.
//
// NOTE: this only works on a long-running Node server (Docker/VM/PM2).
// On serverless platforms (e.g. Vercel) the process doesn't stay alive
// between requests, so node-cron won't fire reliably — point an external
// cron (e.g. Vercel Cron, a system crontab) at a protected route that
// calls runBackupForTask for each due task instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleAllTasks } = await import("./lib/backup/scheduler");
    try {
      await scheduleAllTasks();
    } catch (err) {
      console.error("[scheduler] failed to schedule tasks at startup — the app will still start, but scheduled backups won't run until this is resolved:", err);
    }
  }
}