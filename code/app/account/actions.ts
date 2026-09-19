"use server";

import { db } from "@/db";
import { userTotp, userRecoveryCode, userPasskey, appUser } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import QRCode from "qrcode";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { requireUser } from "@/lib/auth/session";
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
  if (!totp) throw new Error("Start enrollment first");

  const secret = unwrapSecret(totp.encryptedSecret);
  if (!verifyTotpCode(secret, code)) {
    throw new Error("That code didn't match — check your authenticator app and try again.");
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
    throw new Error("Incorrect password");
  }

  await db.delete(userTotp).where(eq(userTotp.userId, me.id));
  await db.delete(userRecoveryCode).where(eq(userRecoveryCode.userId, me.id));
  revalidatePath("/account");
}

export async function regenerateRecoveryCodes() {
  const me = await requireUser();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, me.id)).limit(1);
  if (!totp?.enabled) throw new Error("Two-factor authentication isn't enabled");

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
  if (!challenge) throw new Error("This registration attempt expired — try again.");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration failed");
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