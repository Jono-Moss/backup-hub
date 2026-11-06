"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { userTotp, userRecoveryCode } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getPendingTwoFactorUser, markCurrentSessionTwoFactorVerified, destroySession } from "@/lib/auth/session";
import { unwrapSecret } from "@/lib/backup/crypto";
import { verifyTotpCode } from "@/lib/auth/totp";
import { hashRecoveryCode } from "@/lib/auth/recovery-codes";
import { notifySystemEvent } from "@/lib/notifications/notify";
import { clientInfo, recordLoginAttempt } from "@/lib/auth/login-attempts";
import { checkLockout, minutesLeft } from "@/lib/auth/lockout";

export async function verifyTwoFactorLogin(formData: FormData) {
  const user = await getPendingTwoFactorUser();
  if (!user) redirect("/login");

  const next = String(formData.get("next") ?? "/");
  const code = String(formData.get("code") ?? "").trim();
  const useRecoveryCode = formData.get("mode") === "recovery";
  const method = useRecoveryCode ? "recovery_code" : "totp";

  // Wrong 2FA codes count towards the same lock as wrong passwords. Once
  // locked, the half-signed-in session is dropped: they start again at /login.
  const lock = await checkLockout({ email: user.email, ip: (await clientInfo()).ipAddress });
  if (lock.locked) {
    await recordLoginAttempt({ userId: user.id, email: user.email, method, outcome: "locked_out" });
    await destroySession();
    redirect(`/login?error=locked&minutes=${minutesLeft(lock.until)}&next=${encodeURIComponent(next)}`);
  }

  let ok = false;

  if (useRecoveryCode) {
    const hash = hashRecoveryCode(code);
    const [match] = await db
      .select()
      .from(userRecoveryCode)
      .where(and(eq(userRecoveryCode.userId, user.id), eq(userRecoveryCode.codeHash, hash), isNull(userRecoveryCode.usedAt)))
      .limit(1);
    if (match) {
      await db.update(userRecoveryCode).set({ usedAt: new Date() }).where(eq(userRecoveryCode.id, match.id));
      ok = true;
    }
  } else {
    const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, user.id)).limit(1);
    if (totp?.enabled) {
      ok = verifyTotpCode(unwrapSecret(totp.encryptedSecret), code);
    }
  }

  if (!ok) {
    await recordLoginAttempt({ userId: user.id, email: user.email, method, outcome: "bad_2fa" });
    const mode = useRecoveryCode ? "&mode=recovery" : "";
    redirect(`/login/2fa?error=1&next=${encodeURIComponent(next)}${mode}`);
  }

  await markCurrentSessionTwoFactorVerified();
  await recordLoginAttempt({ userId: user.id, email: user.email, method, outcome: "success" });

  notifySystemEvent("user_login", `${user.name} (${user.email}) logged in.`).catch((err) =>
    console.error("[notify] login email failed:", err)
  );

  redirect(next || "/");
}

export async function cancelTwoFactorLogin() {
  await destroySession();
  redirect("/login");
}
