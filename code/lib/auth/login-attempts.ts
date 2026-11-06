import { headers } from "next/headers";
import { lt } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { loginAttempt, type LoginMethod, type LoginOutcome } from "@/db/schema";

const RETENTION_DAYS = 90;

// First hop of X-Forwarded-For, else X-Real-IP. Only as trustworthy as the
// reverse proxy in front of the app: without one, a client can send any
// value, which defeats the per-IP lockout (the per-account one still holds).
export async function clientInfo() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  const userAgent = h.get("user-agent");
  return { ipAddress: ip ? ip.slice(0, 64) : null, userAgent: userAgent ? userAgent.slice(0, 512) : null };
}

/**
 * Records one sign-in attempt. Never throws: a logging failure must not
 * stop someone signing in (or turn a failed attempt into a 500).
 */
export async function recordLoginAttempt(attempt: {
  userId: string | null;
  email: string | null;
  method: LoginMethod;
  outcome: LoginOutcome;
}) {
  try {
    await db.insert(loginAttempt).values({
      id: uuid(),
      userId: attempt.userId,
      email: attempt.email ? attempt.email.slice(0, 255) : null,
      method: attempt.method,
      outcome: attempt.outcome,
      ...(await clientInfo()),
    });

    // Prune on successful sign-ins only: cheap (indexed), runs regularly on
    // any active server, and an attacker's failed attempts can't trigger it.
    if (attempt.outcome === "success") {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await db.delete(loginAttempt).where(lt(loginAttempt.createdAt, cutoff));
    }
  } catch (err) {
    console.error("[auth] could not record login attempt:", err);
  }
}
