import { cookies } from "next/headers";

// The "relying party" identity WebAuthn binds every passkey to. RP_ID must
// exactly match the domain the app is served from (no scheme, no port) —
// a passkey registered under one RP ID will simply not appear as an option
// under another. ORIGIN must be the exact scheme+host(+port) the browser
// sees. Both default to plain localhost for local dev; production
// deployments MUST set these explicitly, and MUST be served over HTTPS
// (WebAuthn refuses to run over plain HTTP except on localhost).
export const RP_NAME = process.env.WEBAUTHN_RP_NAME || "Backup Hub";
export const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
export const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";

const CHALLENGE_COOKIE = "bh_webauthn_challenge";

// The WebAuthn challenge only needs to survive one round trip in one
// browser (options generated -> ceremony completed -> verified), and isn't
// sensitive on its own (it doesn't grant anything without a valid
// signature to go with it), so a short-lived httpOnly cookie is a simpler
// and more concurrency-safe home for it than a DB row — it avoids having
// to correlate which of possibly many in-flight usernameless login
// attempts a given verification call belongs to.
export async function setChallengeCookie(challenge: string) {
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });
}

export async function consumeChallengeCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CHALLENGE_COOKIE)?.value ?? null;
  if (value) store.delete(CHALLENGE_COOKIE);
  return value;
}
