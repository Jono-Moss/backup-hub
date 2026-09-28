"use server";

import { db } from "@/db";
import {
  appUser,
  session,
  userTotp,
  userRecoveryCode,
  userPasskey,
  backupTask,
  taskShare,
  apiKey,
  type Role,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { purgeTask } from "@/lib/backup/purge";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuid } from "uuid";
import { hashPassword, isPasswordStrongEnough } from "@/lib/auth/password";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { notifySystemEvent } from "@/lib/notifications/notify";

// Admins see how many tasks each user owns — a count only. They can't open,
// list or change anyone's tasks unless the owner shares them.
export async function listUsers() {
  await requireAdmin();
  return db
    .select({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      createdAt: appUser.createdAt,
      taskCount: sql<number>`(select count(*) from ${backupTask} where ${backupTask.ownerId} = ${appUser.id})`.mapWith(Number),
    })
    .from(appUser)
    .orderBy(desc(appUser.createdAt));
}

export async function getUser(id: string) {
  await requireAdmin();
  const [user] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      taskCount: sql<number>`(select count(*) from ${backupTask} where ${backupTask.ownerId} = ${appUser.id})`.mapWith(Number),
    })
    .from(appUser)
    .where(eq(appUser.id, id))
    .limit(1);
  return user ?? null;
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "user") as Role;

  if (!email || !name || !password) {
    throw new Error("Name, email, and password are required");
  }
  if (!isPasswordStrongEnough(password)) {
    throw new Error("Password must be at least 8 characters");
  }

  await db.insert(appUser).values({
    id: uuid(),
    email,
    name,
    hashedPassword: await hashPassword(password),
    role,
  });

  notifySystemEvent("user_created", `A new ${role} account was created for ${name} (${email}).`).catch((err) =>
    console.error("[notify] user_created email failed:", err)
  );

  revalidatePath("/users");
  redirect("/users");
}

// Update name/role, and optionally reset the password (admin-initiated reset —
// leave the password field blank to leave it unchanged).
export async function updateUser(userId: string, formData: FormData) {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "user") as Role;
  const password = String(formData.get("password") ?? "");

  if (admin.id === userId && role !== "admin") {
    throw new Error("You can't remove your own admin role");
  }

  const updates: Record<string, unknown> = { name, role };
  if (password) {
    if (!isPasswordStrongEnough(password)) {
      throw new Error("Password must be at least 8 characters");
    }
    updates.hashedPassword = await hashPassword(password);
  }

  await db.update(appUser).set(updates).where(eq(appUser.id, userId));
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
}

export async function deleteUser(userId: string, deleteFiles: boolean) {
  const admin = await requireAdmin();
  if (admin.id === userId) {
    throw new Error("You can't delete your own account");
  }

  const [target] = await db.select().from(appUser).where(eq(appUser.id, userId)).limit(1);
  if (!target) return;

  // Deleting a user deletes everything they own: every task (with its
  // history, recipients and shares) goes with them. The backup files on disk
  // are only removed if the admin chose to; otherwise they stay on the server. Nothing is
  // handed to the admin — an admin only ever gets access to a user's tasks
  // if that user shared them.
  const owned = await db.select({ id: backupTask.id }).from(backupTask).where(eq(backupTask.ownerId, userId));
  for (const task of owned) {
    await purgeTask(task.id, { deleteFiles: deleteFiles === true });
  }

  // Access this user had to other people's tasks, and their API keys.
  await db.delete(taskShare).where(eq(taskShare.userId, userId));
  await db.delete(apiKey).where(eq(apiKey.userId, userId));

  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(appUser).where(eq(appUser.id, userId));

  notifySystemEvent(
    "user_deleted",
    `The account for ${target.name} (${target.email}) was deleted, along with ${owned.length} backup task${owned.length === 1 ? "" : "s"} (backup files ${deleteFiles === true ? "deleted" : "kept on disk"}).`
  ).catch((err) =>
    console.error("[notify] user_deleted email failed:", err)
  );

  revalidatePath("/users");
  redirect("/users");
}

// --- Auth factors (2FA / passkeys) — admin visibility & account recovery ---

export async function getUserAuthFactors(userId: string) {
  await requireAdmin();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
  const passkeys = await db.select().from(userPasskey).where(eq(userPasskey.userId, userId));
  return { totpEnabled: !!totp?.enabled, passkeyCount: passkeys.length };
}

// Account-recovery action for a user who's lost both their authenticator
// app and their passkey device: wipes every second factor and revokes all
// sessions, so they fall back to password-only login (and can re-enroll
// from /account afterward). Deliberately blunt rather than offering to
// remove factors individually — a support flow, not routine maintenance.
export async function adminResetAuthFactors(userId: string) {
  const admin = await requireAdmin();
  const [target] = await db.select().from(appUser).where(eq(appUser.id, userId)).limit(1);
  if (!target) return;

  await db.delete(userTotp).where(eq(userTotp.userId, userId));
  await db.delete(userRecoveryCode).where(eq(userRecoveryCode.userId, userId));
  await db.delete(userPasskey).where(eq(userPasskey.userId, userId));
  await db.delete(session).where(eq(session.userId, userId));

  notifySystemEvent(
    "security_reset",
    `${admin.name} reset two-factor authentication and passkeys for ${target.name} (${target.email}).`
  ).catch((err) => console.error("[notify] auth factor reset email failed:", err));

  revalidatePath(`/users/${userId}`);
}



export async function getCurrentUserProfile() {
  return requireUser();
}

export async function updateOwnProfile(formData: FormData) {
  const me = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!name) throw new Error("Name is required");

  const [user] = await db.select().from(appUser).where(eq(appUser.id, me.id)).limit(1);
  if (!user) throw new Error("User not found");

  const updates: Record<string, unknown> = { name };

  if (newPassword) {
    const { verifyPassword } = await import("@/lib/auth/password");
    if (!currentPassword || !(await verifyPassword(user.hashedPassword, currentPassword))) {
      throw new Error("Current password is incorrect");
    }
    if (!isPasswordStrongEnough(newPassword)) {
      throw new Error("New password must be at least 8 characters");
    }
    updates.hashedPassword = await hashPassword(newPassword);
  }

  await db.update(appUser).set(updates).where(eq(appUser.id, me.id));
  revalidatePath("/account");
}
