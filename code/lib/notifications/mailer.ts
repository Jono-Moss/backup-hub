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
