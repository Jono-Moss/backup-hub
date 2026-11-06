import { NextRequest, NextResponse } from "next/server";

// An optimistic first pass, as the Next.js authentication guide recommends:
// Proxy runs on every request (prefetches included), so it only looks at
// whether a session cookie is present — no database lookups here. A visitor
// with no cookie goes straight to /login, keeping where they were headed.
//
// It is NOT the access check. Every protected page, server action and data
// function verifies the session itself through requireUser()/requireAdmin()
// in lib/auth/session.ts, which rejects expired, revoked and 2FA-pending
// sessions and non-admins on admin pages.
//
// The REST API (/api/v1/*) uses its own scoped API-key auth (see
// lib/auth/api-key.ts) and is intentionally not touched here.
const COOKIE_NAME = "bh_session";
const PUBLIC_PATHS = new Set(["/login", "/login/2fa", "/login/forgot", "/login/reset", "/setup"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!req.cookies.get(COOKIE_NAME)?.value) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals and static image files (public/ and app/icon.png),
  // per the Proxy docs' negative-matching advice, so the login redirect never
  // blocks an image. Pages and actions never end in these extensions.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
