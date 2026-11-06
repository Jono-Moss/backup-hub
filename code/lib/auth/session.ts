import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { session, appUser, type Role } from "@/db/schema";
import { eq, and, gt, ne } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { hashSessionToken } from "./token-hash";
import { clientInfo } from "./login-attempts";

const COOKIE_NAME = "bh_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// "Last active" is refreshed at most this often (or when the IP changes), so
// browsing doesn't turn every request into a database write.
const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** The session row this request is using — lets the UI mark "this device". */
  sessionId: string;
  /** Chosen interface language, or null to follow the browser (see i18n/request.ts). */
  locale: string | null;
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
  const { ipAddress, userAgent } = await clientInfo();

  await db.insert(session).values({
    id: uuid(),
    userId,
    hashedToken: hashSessionToken(raw),
    twoFactorVerified: opts?.twoFactorVerified ?? true,
    expiresAt,
    createdIp: ipAddress,
    userAgent,
    lastSeenAt: new Date(),
    lastSeenIp: ipAddress,
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
//
// Memoised per request with React cache(): the layout, the page and the data
// functions it calls all ask, but the session is only looked up once.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [row] = await db
    .select({
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      locale: appUser.locale,
      sessionId: session.id,
      lastSeenAt: session.lastSeenAt,
      lastSeenIp: session.lastSeenIp,
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
  await touchSession(row.sessionId, row.lastSeenAt, row.lastSeenIp);
  return { id: row.userId, email: row.email, name: row.name, role: row.role, sessionId: row.sessionId, locale: row.locale };
});

// Records when and from where a session was last used, for Account → Active
// sessions. Never fails the request it's part of.
async function touchSession(sessionId: string, lastSeenAt: Date | null, lastSeenIp: string | null) {
  try {
    const { ipAddress } = await clientInfo();
    const stale = !lastSeenAt || Date.now() - lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS;
    if (!stale && ipAddress === lastSeenIp) return;
    await db.update(session).set({ lastSeenAt: new Date(), lastSeenIp: ipAddress }).where(eq(session.id, sessionId));
  } catch (err) {
    console.error("[auth] could not update session activity:", err);
  }
}

/**
 * Signs a user out everywhere except (optionally) one session — used after a
 * password change, so a stolen session cookie stops working, and by
 * "Sign out everywhere else". Returns how many sessions were ended.
 */
export async function endOtherSessions(userId: string, keepSessionId: string | null): Promise<number> {
  const where = keepSessionId
    ? and(eq(session.userId, userId), ne(session.id, keepSessionId))
    : eq(session.userId, userId);
  const [result] = await db.delete(session).where(where);
  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

// The counterpart to getCurrentUser() for the brief window between a
// correct password and a completed 2FA step: returns the user for a
// session that exists but has twoFactorVerified = false, so /login/2fa
// knows who it's verifying without treating them as logged in yet.
export const getPendingTwoFactorUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [row] = await db
    .select({
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      locale: appUser.locale,
      sessionId: session.id,
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
  return { id: row.userId, email: row.email, name: row.name, role: row.role, sessionId: row.sessionId, locale: row.locale };
});

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

// The real access check (the "Data Access Layer" in the Next.js auth guide).
// Every protected page, server action and data function calls this, directly
// or via requireAdmin/requireTaskScope. proxy.ts only does a quick cookie
// check, so this is what actually rejects an expired, revoked or half-finished
// (2FA pending) session — by redirecting, so a page or action sends the user
// to sign in rather than erroring. Don't call it inside a try/catch: redirect()
// works by throwing.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;
  if (await getPendingTwoFactorUser()) redirect("/login/2fa");
  redirect("/login");
}

/** requireUser() plus the admin role; anyone else is sent to the dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function hasAnyUsers(): Promise<boolean> {
  const [row] = await db.select({ id: appUser.id }).from(appUser).limit(1);
  return !!row;
}
