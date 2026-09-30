import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

// Lazily built, and cached, so a missing SMTP config doesn't throw at
// import time — only when an actual send is attempted (and even then,
// callers should treat notification failures as non-fatal to the
// backup/user-management flow that triggered them).
function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT) {
    console.warn("[mailer] SMTP_HOST/SMTP_PORT not set — email notifications are disabled");
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

// Best-effort send for notifications: never throws, silently no-ops if SMTP
// isn't configured. Do NOT use this for anything the user is relying on to
// actually deliver — see sendMailStrict below.
export async function sendMail(to: string, subject: string, text: string) {
  const t = getTransporter();
  if (!t) return; // notifications are best-effort; silently no-op if unconfigured

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || "Backup Hub <backup-hub@localhost>",
      to,
      subject,
      text,
    });
  } catch (err) {
    // Never let a notification failure break the backup/user-management
    // flow that triggered it — log and move on.
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err);
  }
}

export interface MailAttachment {
  filename: string;
  path: string; // local filesystem path — nodemailer streams it rather than loading it all into memory
}

// Same transport, but errors propagate. Used by the "email" backup
// destination, where a silent failure would mean the user thinks a backup
// was delivered when it wasn't.
export async function sendMailStrict(to: string, subject: string, text: string, attachments?: MailAttachment[]) {
  const t = getTransporter();
  if (!t) throw new Error("SMTP isn't configured on this server (SMTP_HOST / SMTP_PORT).");
  await t.sendMail({
    from: process.env.SMTP_FROM || "Backup Hub <backup-hub@localhost>",
    to,
    subject,
    text,
    attachments,
  });
}
