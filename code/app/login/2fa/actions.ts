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

export async function verifyTwoFactorLogin(formData: FormData) {
  const user = await getPendingTwoFactorUser();
  if (!user) redirect("/login");

  const next = String(formData.get("next") ?? "/");
  const code = String(formData.get("code") ?? "").trim();
  const useRecoveryCode = formData.get("mode") === "recovery";

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
    const mode = useRecoveryCode ? "&mode=recovery" : "";
    redirect(`/login/2fa?error=1&next=${encodeURIComponent(next)}${mode}`);
  }

  await markCurrentSessionTwoFactorVerified();

  notifySystemEvent("user_login", `${user.name} (${user.email}) logged in.`).catch((err) =>
    console.error("[notify] login email failed:", err)
  );

  redirect(next || "/");
}

export async function cancelTwoFactorLogin() {
  await destroySession();
  redirect("/login");
}
