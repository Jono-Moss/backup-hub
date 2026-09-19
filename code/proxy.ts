import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { session, appUser } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { hashSessionToken } from "@/lib/auth/token-hash";

// Only gates the first-party UI. The REST API (/api/v1/*) uses its own
// scoped API-key auth (see lib/auth/api-key.ts) and is intentionally not
// touched here.
const COOKIE_NAME = "bh_session";
const ADMIN_ONLY_PREFIXES = ["/users", "/notifications"];
const PUBLIC_PATHS = new Set(["/login", "/login/2fa", "/setup"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const redirectToLogin = () => {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  };

  if (!raw) return redirectToLogin();

  // Real DB lookup (proxy.ts runs on the Node.js runtime in Next.js 16),
  // not just a signature check — a revoked/expired session or a deleted
  // user is rejected here rather than only in individual pages/actions.
  const [row] = await db
    .select({ role: appUser.role, twoFactorVerified: session.twoFactorVerified })
    .from(session)
    .innerJoin(appUser, eq(session.userId, appUser.id))
    .where(and(eq(session.hashedToken, hashSessionToken(raw)), gt(session.expiresAt, new Date())))
    .limit(1);

  if (!row) return redirectToLogin();

  // Password verified but the second factor hasn't been — send them to
  // finish it rather than either blocking entirely (they'd have no way to
  // get to /login/2fa) or letting them through (defeats the point of 2FA).
  if (!row.twoFactorVerified) {
    const twoFactorUrl = new URL("/login/2fa", req.url);
    twoFactorUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(twoFactorUrl);
  }

  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && row.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
