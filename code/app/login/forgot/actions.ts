"use server";

import { redirect } from "next/navigation";
import { requestPasswordReset } from "@/lib/auth/password-reset";

export async function forgotPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email) await requestPasswordReset(email);
  // Same response whether or not the email has an account.
  redirect("/login/forgot?sent=1");
}
