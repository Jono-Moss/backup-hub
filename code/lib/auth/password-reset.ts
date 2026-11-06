import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { appUser, passwordResetToken, session } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { clientInfo, recordLoginAttempt } from "@/lib/auth/login-attempts";
import { sendMailStrict, sendMail } from "@/lib/notifications/mailer";
import { notifySystemEvent } from "@/lib/notifications/notify";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/lib/i18n/locales";

// Emails go out in the recipient's chosen language, else the language of
// the browser making the request.
async function emailTranslator(userLocale: string | null) {
  const locale = isLocale(userLocale) ? userLocale : await getLocale();
  return getTranslations({ locale, namespace: "passwordReset.email" });
}

// "Forgot password" by emailed link. Completing a reset also clears a sign-in
// lockout (it's recorded as a "password_reset" attempt, which resets the
// failure count — see lib/auth/lockout.ts), so it doubles as the way out for
// a locked-out admin. It does NOT skip 2FA: the next sign-in still asks for
// the authenticator code if the account has one.

const TOKEN_MINUTES = 30;
const MAX_REQUESTS_PER_HOUR = 3;

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Links are built from configuration, never from the request's Host header,
// so a forged Host can't make us email a link to someone else's server.
function appUrl() {
  const base = process.env.APP_URL || process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

/**
 * Emails a reset link if `email` belongs to an account. Always resolves the
 * same way whether or not it does, so the page can't be used to find out
 * which emails have accounts. Quietly does nothing past
 * MAX_REQUESTS_PER_HOUR links per account.
 */
export async function requestPasswordReset(email: string) {
  const [user] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);
  if (!user) return;

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: passwordResetToken.id })
    .from(passwordResetToken)
    .where(and(eq(passwordResetToken.userId, user.id), gt(passwordResetToken.createdAt, hourAgo)));
  if (recent.length >= MAX_REQUESTS_PER_HOUR) return;

  const raw = crypto.randomBytes(32).toString("base64url");
  await db.insert(passwordResetToken).values({
    id: uuid(),
    userId: user.id,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60 * 1000),
    requestedIp: (await clientInfo()).ipAddress,
  });

  const link = `${appUrl()}/login/reset?token=${encodeURIComponent(raw)}`;
  const t = await emailTranslator(user.locale);
  try {
    await sendMailStrict(user.email, t("resetSubject"), t("resetBody", { name: user.name, link, minutes: TOKEN_MINUTES }));
  } catch (err) {
    console.error("[auth] could not send password reset email:", err);
  }
}

/** The user a still-valid reset token belongs to, or null. */
export async function findResetToken(raw: string) {
  if (!raw) return null;
  const [row] = await db
    .select({ id: passwordResetToken.id, userId: passwordResetToken.userId, email: appUser.email, name: appUser.name, locale: appUser.locale })
    .from(passwordResetToken)
    .innerJoin(appUser, eq(appUser.id, passwordResetToken.userId))
    .where(
      and(
        eq(passwordResetToken.tokenHash, hashToken(raw)),
        isNull(passwordResetToken.usedAt),
        gt(passwordResetToken.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Sets the new password, burns the token (and any others for the user),
 * signs the user out everywhere, and clears any lockout. Returns false if
 * the token is no longer valid.
 */
export async function completePasswordReset(raw: string, newPassword: string) {
  const token = await findResetToken(raw);
  if (!token) return false;

  // Claim the token first; if two submits race, only one gets affectedRows.
  const [claim] = await db
    .update(passwordResetToken)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetToken.id, token.id), isNull(passwordResetToken.usedAt)));
  if (!claim || (claim as { affectedRows?: number }).affectedRows === 0) return false;

  await db.update(appUser).set({ hashedPassword: await hashPassword(newPassword) }).where(eq(appUser.id, token.userId));
  await db
    .delete(passwordResetToken)
    .where(and(eq(passwordResetToken.userId, token.userId), isNull(passwordResetToken.usedAt)));
  await db.delete(session).where(eq(session.userId, token.userId));
  await recordLoginAttempt({ userId: token.userId, email: token.email, method: "password", outcome: "password_reset" });

  const t = await emailTranslator(token.locale);
  sendMail(token.email, t("changedSubject"), t("changedBody", { name: token.name })).catch(() => {});
  notifySystemEvent("security_reset", `${token.name} (${token.email}) reset their password via an emailed link.`).catch(
    (err) => console.error("[notify] password reset notification failed:", err)
  );
  return true;
}
