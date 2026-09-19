"use server";

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
    throw new Error("Setup has already been completed");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !name || !password) {
    throw new Error("Name, email, and password are all required");
  }
  if (!isPasswordStrongEnough(password)) {
    throw new Error("Password must be at least 8 characters");
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
