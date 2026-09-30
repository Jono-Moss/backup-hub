import fs from "fs";
import path from "path";
import { sendMailStrict } from "@/lib/notifications/mailer";
import type { BackupDestination, DestinationConfig } from "./types";
import { formatBytes } from "@/lib/notifications/notifyUtils";

// Emails the backup file as an attachment. This is deliberately its own
// destination, NOT part of the notification-recipient system: those are
// "tell me it worked/failed" emails, while this is "deliver me the data",
// and it commonly goes to a different address (a shared mailbox, an
// archive address) than whoever gets the alerts.
//
// Sent through the server's SMTP settings (SMTP_* env vars), so it needs
// SMTP configured — unlike notifications, a missing/broken SMTP setup is a
// real failure here, because otherwise the run history would claim a
// backup was delivered when it wasn't.

function maxBytes(config: DestinationConfig): number {
  const mb = Number(config.maxSizeMb);
  if (!Number.isFinite(mb) || mb <= 0) throw new Error("This destination has no valid size limit configured.");
  return Math.round(mb * 1024 * 1024);
}

export const emailDestination: BackupDestination = {
  type: "email",
  label: "Email (attach the backup file)",
  configFields: [
    {
      name: "to",
      label: "Send to",
      type: "text",
      required: true,
      placeholder: "backups@example.com",
      helpText: "Separate multiple addresses with commas. Independent of the task's notification recipients.",
    },
    {
      name: "maxSizeMb",
      label: "Maximum file size (MB)",
      type: "number",
      required: true,
      defaultValue: "10",
      helpText: "Backups larger than this are skipped, not emailed — and the run history shows them as skipped. Check your mail provider's attachment limit (many cap around 25 MB, and email adds ~33% overhead).",
    },
  ],

  async upload(config, localFilePath, remoteFileName, context) {
    const limit = maxBytes(config);
    const { size } = await fs.promises.stat(localFilePath);

    if (size > limit) {
      return {
        remotePath: config.to,
        skipped: `File is ${formatBytes(size)}, over the ${formatBytes(limit)} email limit — not sent.`,
      };
    }

    await sendMailStrict(
      config.to,
      `Backup: ${context.taskName}`,
      `Attached is the latest backup for "${context.taskName}".\n\nFile: ${remoteFileName}\nSize: ${formatBytes(size)}`,
      [{ filename: path.basename(remoteFileName), path: localFilePath }]
    );

    return { remotePath: `emailed to ${config.to}` };
  },

  // Sends a real (tiny) message, since "did it reach that address?" is the
  // thing worth checking — an SMTP handshake alone wouldn't catch a typo.
  async testConnection(config) {
    try {
      await sendMailStrict(
        config.to,
        "Backup Hub test email",
        "This is a test from Backup Hub. Backups for this task will be emailed to this address (when they're under the size limit you set)."
      );
      return { ok: true, message: `Test email sent to ${config.to}.` };
    } catch (err: any) {
      return { ok: false, message: String(err.message ?? err).slice(0, 500) };
    }
  },
};
