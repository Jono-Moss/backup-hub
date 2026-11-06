"use server";

import { redirect } from "next/navigation";
import { completePasswordReset } from "@/lib/auth/password-reset";
import { isPasswordStrongEnough } from "@/lib/auth/password";

export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (error: string) => redirect(`/login/reset?token=${encodeURIComponent(token)}&error=${error}`);

  if (password !== confirm) back("mismatch");
  if (!isPasswordStrongEnough(password)) back("weak");

  if (!(await completePasswordReset(token, password))) {
    redirect("/login/reset?error=invalid");
  }
  redirect("/login?reset=1");
}
