import crypto from "crypto";

// Shared by lib/auth/session.ts (Node runtime, server actions/pages) and
// proxy.ts (also Node runtime as of Next.js 16) so both hash session
// cookie tokens identically without duplicating the function.
export function hashSessionToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
