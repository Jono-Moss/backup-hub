import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { session, appUser, type Role } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { hashSessionToken } from "./token-hash";

const COOKIE_NAME = "bh_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

// Creates a DB-backed session row and sets the httpOnly cookie. Only the
// hash of the token is stored, same pattern as API keys — the raw token
// lives solely in the cookie.
//
// twoFactorVerified defaults to true. Pass false only for a password login
// belonging to a user with TOTP enabled — the session exists (so the
// /login/2fa step can identify who's mid-login) but getCurrentUser() won't
// return a user for it until it's flipped to true by verifyTotpLogin/
// verifyRecoveryCodeLogin. Passkey logins should always leave this true, since
// a passkey is itself phishing-resistant MFA.
export async function createSession(userId: string, opts?: { twoFactorVerified?: boolean }) {
  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(session).values({
    id: uuid(),
    userId,
    hashedToken: hashSessionToken(raw),
    twoFactorVerified: opts?.twoFactorVerified ?? true,
    expiresAt,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw) {
    await db.delete(session).where(eq(session.hashedToken, hashSessionToken(raw)));
  }
  store.delete(COOKIE_NAME);
}

// Looks up the current session's user from the DB (not just a signature
// check), so a deleted user or an expired/cleared session is rejected
// immediately rather than trusting a still-valid-looking cookie. Returns
// null for a session that's pending its second factor — use
// getPendingTwoFactorUser() for that case instead.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [row] = await db
    .select({
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
    })
    .from(session)
    .innerJoin(appUser, eq(session.userId, appUser.id))
    .where(
      and(
        eq(session.hashedToken, hashSessionToken(raw)),
        eq(session.twoFactorVerified, true),
        gt(session.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;
  return { id: row.userId, email: row.email, name: row.name, role: row.role };
}

// The counterpart to getCurrentUser() for the brief window between a
// correct password and a completed 2FA step: returns the user for a
// session that exists but has twoFactorVerified = false, so /login/2fa
// knows who it's verifying without treating them as logged in yet.
export async function getPendingTwoFactorUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [row] = await db
    .select({
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
    })
    .from(session)
    .innerJoin(appUser, eq(session.userId, appUser.id))
    .where(
      and(
        eq(session.hashedToken, hashSessionToken(raw)),
        eq(session.twoFactorVerified, false),
        gt(session.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;
  return { id: row.userId, email: row.email, name: row.name, role: row.role };
}

// Called once /login/2fa accepts a valid TOTP or recovery code — flips the
// existing pending session to fully verified rather than issuing a new one,
// so the cookie the browser already has keeps working.
export async function markCurrentSessionTwoFactorVerified() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) throw new Error("No pending session");

  await db
    .update(session)
    .set({ twoFactorVerified: true })
    .where(and(eq(session.hashedToken, hashSessionToken(raw)), eq(session.twoFactorVerified, false)));
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Admin permission required");
  return user;
}

export async function hasAnyUsers(): Promise<boolean> {
  const [row] = await db.select({ id: appUser.id }).from(appUser).limit(1);
  return !!row;
}
