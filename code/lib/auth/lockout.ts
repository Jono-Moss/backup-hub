import { and, desc, eq, gt, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempt, type LoginOutcome } from "@/db/schema";

// Sign-in lockouts, worked out from the login_attempt history — no extra
// state to keep in sync.
//
// Account: LOGIN_MAX_FAILED_ATTEMPTS failed password/2FA attempts for one
// email within LOGIN_LOCKOUT_MINUTES locks that email until
// LOGIN_LOCKOUT_MINUTES after the last of them. Attempts refused *because*
// of the lock are recorded as "locked_out" and don't count, so hammering a
// locked account never extends the lock. A success, an admin's "unlocked",
// or a password reset by emailed link resets the count. Unknown emails lock the same way, so the
// lockout message can't be used to find out which emails have accounts.
//
// Passkeys skip the account lock (they can't be guessed, and it means a
// password-guessing attacker can't lock the real owner out), but every
// method is subject to the per-IP lock: LOGIN_MAX_FAILED_ATTEMPTS_PER_IP
// failures of any kind from one address within the same window.
//
// Setting a limit to 0 turns that lock off.

const ACCOUNT_FAILURES: LoginOutcome[] = ["bad_password", "unknown_user", "bad_2fa"];
const IP_FAILURES: LoginOutcome[] = ["bad_password", "unknown_user", "bad_2fa", "passkey_failed"];
const RESETS: LoginOutcome[] = ["success", "unlocked", "password_reset"];

function envInt(name: string, fallback: number) {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function lockoutSettings() {
  return {
    maxAccountFailures: envInt("LOGIN_MAX_FAILED_ATTEMPTS", 2),
    maxIpFailures: envInt("LOGIN_MAX_FAILED_ATTEMPTS_PER_IP", 20),
    lockoutMinutes: Math.max(1, envInt("LOGIN_LOCKOUT_MINUTES", 15)),
  };
}

export type Lockout = { locked: false } | { locked: true; reason: "account" | "ip"; until: Date };

async function lockedUntil(
  match: SQL,
  failures: LoginOutcome[],
  max: number,
  lockoutMs: number,
  resetAware: boolean
): Promise<Date | null> {
  if (max <= 0) return null;
  let since = new Date(Date.now() - lockoutMs);

  if (resetAware) {
    const [reset] = await db
      .select({ at: loginAttempt.createdAt })
      .from(loginAttempt)
      .where(and(match, inArray(loginAttempt.outcome, RESETS), gt(loginAttempt.createdAt, since)))
      .orderBy(desc(loginAttempt.createdAt))
      .limit(1);
    if (reset) since = reset.at;
  }

  const recent = await db
    .select({ at: loginAttempt.createdAt })
    .from(loginAttempt)
    .where(and(match, inArray(loginAttempt.outcome, failures), gt(loginAttempt.createdAt, since)))
    .orderBy(desc(loginAttempt.createdAt))
    .limit(max);
  if (recent.length < max) return null;

  const until = new Date(recent[0].at.getTime() + lockoutMs);
  return until > new Date() ? until : null;
}

/**
 * Whether a sign-in should be refused right now. Pass `email` for password
 * and 2FA attempts (account lock + IP lock); omit it for passkeys (IP only).
 */
export async function checkLockout({ email, ip }: { email?: string | null; ip: string | null }): Promise<Lockout> {
  const { maxAccountFailures, maxIpFailures, lockoutMinutes } = lockoutSettings();
  const lockoutMs = lockoutMinutes * 60 * 1000;

  if (email) {
    const until = await lockedUntil(eq(loginAttempt.email, email), ACCOUNT_FAILURES, maxAccountFailures, lockoutMs, true);
    if (until) return { locked: true, reason: "account", until };
  }
  if (ip) {
    // No reset on success here: one good sign-in from an address shouldn't
    // wipe out a spray of failures against other accounts from it.
    const until = await lockedUntil(eq(loginAttempt.ipAddress, ip), IP_FAILURES, maxIpFailures, lockoutMs, false);
    if (until) return { locked: true, reason: "ip", until };
  }
  return { locked: false };
}

/** Minutes until `until`, rounded up, for "try again in N minutes". */
export function minutesLeft(until: Date) {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
}
