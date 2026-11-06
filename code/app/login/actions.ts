"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { appUser, userTotp, userPasskey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { notifySystemEvent } from "@/lib/notifications/notify";
import { clientInfo, recordLoginAttempt } from "@/lib/auth/login-attempts";
import { checkLockout, minutesLeft } from "@/lib/auth/lockout";
import { RP_ID, ORIGIN, setChallengeCookie, consumeChallengeCookie } from "@/lib/auth/webauthn";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const [user] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);

  // Checked before the password, so a locked account can't be guessed at.
  const lock = await checkLockout({ email, ip: (await clientInfo()).ipAddress });
  if (lock.locked) {
    await recordLoginAttempt({ userId: user?.id ?? null, email, method: "password", outcome: "locked_out" });
    redirect(`/login?error=locked&minutes=${minutesLeft(lock.until)}&next=${encodeURIComponent(next)}`);
  }

  // Deliberately generic error for both "no such user" and "wrong password"
  // so login can't be used to enumerate valid email addresses.
  if (!user || !(await verifyPassword(user.hashedPassword, password))) {
    await recordLoginAttempt({
      userId: user?.id ?? null,
      email,
      method: "password",
      outcome: user ? "bad_password" : "unknown_user",
    });
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, user.id)).limit(1);
  const needsSecondFactor = !!totp?.enabled;

  await createSession(user.id, { twoFactorVerified: !needsSecondFactor });

  if (needsSecondFactor) {
    // Recorded by /login/2fa once the second factor has been checked.
    redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }

  await recordLoginAttempt({ userId: user.id, email: user.email, method: "password", outcome: "success" });

  notifySystemEvent("user_login", `${user.name} (${user.email}) logged in.`).catch((err) =>
    console.error("[notify] login email failed:", err)
  );

  redirect(next || "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// --- Passwordless passkey login ---
// Usernameless/"discoverable credential" flow: we don't know who's signing
// in until the authenticator returns a credential ID, so allowCredentials
// is left empty and the browser's own passkey picker does the narrowing.

export async function startPasskeyLogin() {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
  });
  await setChallengeCookie(options.challenge);
  return options;
}

export async function finishPasskeyLogin(response: AuthenticationResponseJSON) {
  const challenge = await consumeChallengeCookie();
  if (!challenge) {
    return { ok: false as const, error: "This login attempt expired — try again." };
  }

  // Passkeys skip the per-account lock (see lib/auth/lockout.ts), only the per-IP one applies.
  const lock = await checkLockout({ ip: (await clientInfo()).ipAddress });
  if (lock.locked) {
    await recordLoginAttempt({ userId: null, email: null, method: "passkey", outcome: "locked_out" });
    const minutes = minutesLeft(lock.until);
    return {
      ok: false as const,
      error: `Too many failed sign-in attempts from your network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const [passkey] = await db.select().from(userPasskey).where(eq(userPasskey.credentialId, response.id)).limit(1);
  if (!passkey) {
    await recordLoginAttempt({ userId: null, email: null, method: "passkey", outcome: "passkey_failed" });
    return { ok: false as const, error: "That passkey isn't registered with any account here." };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        transports: (passkey.transports ?? undefined) as any,
      },
    });
  } catch (err: any) {
    await recordLoginAttempt({ userId: passkey.userId, email: null, method: "passkey", outcome: "passkey_failed" });
    return { ok: false as const, error: err.message ?? "Passkey verification failed" };
  }

  if (!verification.verified) {
    await recordLoginAttempt({ userId: passkey.userId, email: null, method: "passkey", outcome: "passkey_failed" });
    return { ok: false as const, error: "Passkey verification failed" };
  }

  await db
    .update(userPasskey)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(userPasskey.id, passkey.id));

  const [user] = await db.select().from(appUser).where(eq(appUser.id, passkey.userId)).limit(1);
  if (!user) {
    return { ok: false as const, error: "That account no longer exists." };
  }

  // A passkey is itself phishing-resistant multi-factor authentication —
  // don't additionally require TOTP even if the user also has it enabled.
  await createSession(user.id, { twoFactorVerified: true });
  await recordLoginAttempt({ userId: user.id, email: user.email, method: "passkey", outcome: "success" });

  notifySystemEvent("user_login", `${user.name} (${user.email}) logged in with a passkey.`).catch((err) =>
    console.error("[notify] login email failed:", err)
  );

  return { ok: true as const };
}
