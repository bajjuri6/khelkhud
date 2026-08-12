import { NextResponse, type NextRequest } from "next/server";

/**
 * UX-only routing guard: checks that a session cookie exists before letting the
 * user into protected areas. Real authorization happens on the API; role checks
 * happen in the protected layouts (server-side via /api/auth/me).
 */
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get("kk_session")?.value);
  if (!hasSession) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/onboarding"],
};
