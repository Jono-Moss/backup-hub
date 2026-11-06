"use server";

import { fail } from "@/lib/action-result";
import { db } from "@/db";
import { userTotp, userRecoveryCode, userPasskey, appUser, loginAttempt, session } from "@/db/schema";
import { eq, and, desc, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import QRCode from "qrcode";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { requireUser, endOtherSessions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { wrapSecret, unwrapSecret } from "@/lib/backup/crypto";
import { generateTotpSecret, verifyTotpCode, buildOtpAuthUri } from "@/lib/auth/totp";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/auth/recovery-codes";
import { RP_NAME, RP_ID, ORIGIN, setChallengeCookie, consumeChallengeCookie } from "@/lib/auth/webauthn";

// --- TOTP ---

export async function getTotpStatus() {
  const me = await requireUser();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, me.id)).limit(1);
  if (!totp?.enabled) return { enabled: false as const };

  const remaining = await db
    .select()
    .from(userRecoveryCode)
    .where(and(eq(userRecoveryCode.userId, me.id)));
  const unused = remaining.filter((c) => !c.usedAt).length;

  return { enabled: true as const, unusedRecoveryCodes: unused };
}

// Starts (or restarts) enrollment: generates a fresh secret, stores it
// disabled, and returns everything needed to render the QR code + manual
// entry key. Calling this again before confirming just replaces the
// pending secret — nothing is "enabled" until confirmTotpEnrollment succeeds.
export async function startTotpEnrollment() {
  const me = await requireUser();
  const secret = generateTotpSecret();
  const otpauthUri = buildOtpAuthUri({ secret, accountName: me.email, issuer: "Backup Hub" });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 });

  const [existing] = await db.select().from(userTotp).where(eq(userTotp.userId, me.id)).limit(1);
  if (existing) {
    await db
      .update(userTotp)
      .set({ encryptedSecret: wrapSecret(secret), enabled: false, verifiedAt: null })
      .where(eq(userTotp.id, existing.id));
  } else {
    await db.insert(userTotp).values({ id: uuid(), userId: me.id, encryptedSecret: wrapSecret(secret), enabled: false });
  }

  return { secret, otpauthUri, qrDataUrl };
}

// Confirms enrollment with a code from the app, enables TOTP, and issues a
// fresh batch of recovery codes (returned once, in plaintext, for the user
// to save — only their hashes are persisted).
export async function confirmTotpEnrollment(code: string) {
  const me = await requireUser();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, me.id)).limit(1);
  if (!totp) return fail("Start enrollment first");

  const secret = unwrapSecret(totp.encryptedSecret);
  if (!verifyTotpCode(secret, code)) {
    return fail("That code didn't match — check your authenticator app and try again.");
  }

  await db.update(userTotp).set({ enabled: true, verifiedAt: new Date() }).where(eq(userTotp.id, totp.id));

  // Replace any old recovery codes with a fresh batch tied to this enrollment.
  await db.delete(userRecoveryCode).where(eq(userRecoveryCode.userId, me.id));
  const codes = generateRecoveryCodes();
  await db.insert(userRecoveryCode).values(
    codes.map((code) => ({ id: uuid(), userId: me.id, codeHash: hashRecoveryCode(code) }))
  );

  return { recoveryCodes: codes };
}

export async function disableTotp(formData: FormData) {
  const me = await requireUser();
  const password = String(formData.get("password") ?? "");

  const [user] = await db.select().from(appUser).where(eq(appUser.id, me.id)).limit(1);
  if (!user || !(await verifyPassword(user.hashedPassword, password))) {
    return fail("Incorrect password");
  }

  await db.delete(userTotp).where(eq(userTotp.userId, me.id));
  await db.delete(userRecoveryCode).where(eq(userRecoveryCode.userId, me.id));
  revalidatePath("/account");
}

export async function regenerateRecoveryCodes() {
  const me = await requireUser();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, me.id)).limit(1);
  if (!totp?.enabled) return fail("Two-factor authentication isn't enabled");

  await db.delete(userRecoveryCode).where(eq(userRecoveryCode.userId, me.id));
  const codes = generateRecoveryCodes();
  await db.insert(userRecoveryCode).values(
    codes.map((code) => ({ id: uuid(), userId: me.id, codeHash: hashRecoveryCode(code) }))
  );

  return { recoveryCodes: codes };
}

// --- Passkeys ---

export async function listPasskeys() {
  const me = await requireUser();
  return db.select().from(userPasskey).where(eq(userPasskey.userId, me.id));
}

export async function startPasskeyRegistration() {
  const me = await requireUser();
  const existing = await db.select().from(userPasskey).where(eq(userPasskey.userId, me.id));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: me.email,
    userDisplayName: me.name,
    userID: new TextEncoder().encode(me.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports ?? undefined })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  await setChallengeCookie(options.challenge);
  return options;
}

export async function finishPasskeyRegistration(name: string, response: RegistrationResponseJSON) {
  const me = await requireUser();
  const challenge = await consumeChallengeCookie();
  if (!challenge) return fail("This registration attempt expired — try again.");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return fail("Passkey registration failed");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await db.insert(userPasskey).values({
    id: uuid(),
    userId: me.id,
    name: name.trim() || "Passkey",
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports ?? [],
  });

  revalidatePath("/account");
}

export async function deletePasskey(id: string) {
  const me = await requireUser();
  await db.delete(userPasskey).where(and(eq(userPasskey.id, id), eq(userPasskey.userId, me.id)));
  revalidatePath("/account");
}
// --- Sign-in history ---

const SIGN_IN_DAYS = 7;

const attemptColumns = {
  id: loginAttempt.id,
  method: loginAttempt.method,
  outcome: loginAttempt.outcome,
  ipAddress: loginAttempt.ipAddress,
  userAgent: loginAttempt.userAgent,
  createdAt: loginAttempt.createdAt,
};

/** The signed-in user's own recent sign-in attempts, newest first. */
export async function listMyLoginAttempts(limit = 15) {
  const me = await requireUser();
  return db
    .select(attemptColumns)
    .from(loginAttempt)
    .where(eq(loginAttempt.userId, me.id))
    .orderBy(desc(loginAttempt.createdAt))
    .limit(limit);
}

// For the dashboard: the user's own sign-in picture, plus — for admins only —
// failures across the whole server (including emails with no account).
export async function getSignInSummary() {
  const me = await requireUser();
  const since = new Date(Date.now() - SIGN_IN_DAYS * 24 * 60 * 60 * 1000);
  const failed = inArray(loginAttempt.outcome, ["bad_password", "unknown_user", "bad_2fa", "passkey_failed"]);

  const [successes, myFailures] = await Promise.all([
    // [0] is normally this very session's sign-in; [1] is the one before.
    db
      .select(attemptColumns)
      .from(loginAttempt)
      .where(and(eq(loginAttempt.userId, me.id), eq(loginAttempt.outcome, "success")))
      .orderBy(desc(loginAttempt.createdAt))
      .limit(2),
    db
      .select(attemptColumns)
      .from(loginAttempt)
      .where(and(eq(loginAttempt.userId, me.id), failed, gte(loginAttempt.createdAt, since)))
      .orderBy(desc(loginAttempt.createdAt)),
  ]);

  const mine = {
    previousSuccess: successes[1] ?? null,
    failedCount: myFailures.length,
    // Right password, wrong 2FA code: someone may know the password.
    secondFactorFailures: myFailures.filter((a) => a.outcome === "bad_2fa").length,
    recentFailures: myFailures.slice(0, 5),
  };

  if (me.role !== "admin") return { days: SIGN_IN_DAYS, mine, server: null };

  const recentFailed = and(failed, gte(loginAttempt.createdAt, since));
  const [totals, unknown, blocked, topIps, topAccounts] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(loginAttempt).where(recentFailed),
    db
      .select({ n: sql<number>`count(*)` })
      .from(loginAttempt)
      .where(and(eq(loginAttempt.outcome, "locked_out"), gte(loginAttempt.createdAt, since))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(loginAttempt)
      .where(and(recentFailed, isNull(loginAttempt.userId))),
    db
      .select({ ip: loginAttempt.ipAddress, n: sql<number>`count(*)` })
      .from(loginAttempt)
      .where(recentFailed)
      .groupBy(loginAttempt.ipAddress)
      .orderBy(desc(sql`count(*)`))
      .limit(3),
    db
      .select({ email: appUser.email, n: sql<number>`count(*)` })
      .from(loginAttempt)
      .innerJoin(appUser, eq(appUser.id, loginAttempt.userId))
      .where(recentFailed)
      .groupBy(appUser.email)
      .orderBy(desc(sql`count(*)`))
      .limit(3),
  ]);

  return {
    days: SIGN_IN_DAYS,
    mine,
    server: {
      failedCount: Number(totals[0]?.n ?? 0),
      unknownAccountCount: Number(unknown[0]?.n ?? 0),
      blockedCount: Number(blocked[0]?.n ?? 0),
      topIps: topIps.map((r) => ({ ip: r.ip ?? "unknown", count: Number(r.n) })),
      topAccounts: topAccounts.map((r) => ({ email: r.email, count: Number(r.n) })),
    },
  };
}

// --- Active sessions ---

/** The signed-in user's current sessions (signed in and not expired), newest activity first. */
export async function listMySessions() {
  const me = await requireUser();
  const rows = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      createdIp: session.createdIp,
      userAgent: session.userAgent,
      lastSeenAt: session.lastSeenAt,
      lastSeenIp: session.lastSeenIp,
    })
    .from(session)
    .where(and(eq(session.userId, me.id), eq(session.twoFactorVerified, true), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.lastSeenAt));
  return rows.map((r) => ({ ...r, current: r.id === me.sessionId }));
}

/** Ends one of the user's other sessions. (This device signs out with the normal Sign out.) */
export async function endSession(sessionId: string) {
  const me = await requireUser();
  if (sessionId === me.sessionId) return fail("That's this device — use Sign out instead.");
  await db.delete(session).where(and(eq(session.id, sessionId), eq(session.userId, me.id)));
  revalidatePath("/account");
}

export async function endAllOtherSessions() {
  const me = await requireUser();
  const ended = await endOtherSessions(me.id, me.sessionId);
  revalidatePath("/account");
  return {
    ok: true as const,
    message: ended === 0 ? "No other sessions to sign out" : `Signed out ${ended} other session${ended === 1 ? "" : "s"}`,
  };
}
