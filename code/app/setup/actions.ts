"use server";

import { fail } from "@/lib/action-result";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { appUser } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { redirect } from "next/navigation";
import { hashPassword, isPasswordStrongEnough } from "@/lib/auth/password";
import { createSession, hasAnyUsers } from "@/lib/auth/session";

// Only works while zero users exist — this is the one-time bootstrap for a
// fresh install, not a general "anyone can sign up" endpoint.
export async function createFirstAdmin(formData: FormData) {
  if (await hasAnyUsers()) {
    return fail((await getTranslations("errors"))("setupDone"));
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !name || !password) {
    return fail((await getTranslations("errors"))("setupFieldsRequired"));
  }
  if (!isPasswordStrongEnough(password)) {
    return fail((await getTranslations("errors"))("passwordTooShort"));
  }

  const id = uuid();
  await db.insert(appUser).values({
    id,
    email,
    name,
    hashedPassword: await hashPassword(password),
    role: "admin",
  });

  await createSession(id);
  redirect("/");
}
