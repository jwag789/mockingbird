import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// A fast, cookie-only gate. Real checks happen in each route handler,
// which load the session and scope every query to its user.
export function proxy(request: NextRequest) {
  // The home page is the landing page for visitors, so it's always open.
  if (getSessionCookie(request) || request.nextUrl.pathname === "/") return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except auth endpoints, the sign-in page and static assets.
  matcher: ["/((?!api/auth|sign-in|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/|voice-capture.worklet.js).*)"],
};
