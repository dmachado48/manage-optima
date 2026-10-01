import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/inbound") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/attachments") ||
    pathname.startsWith("/k/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/manifest") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    // Auth.js prefixes the production HTTPS cookie with `__Secure-`.
    // Without this, getToken looks for the development cookie name and
    // redirects an already authenticated user back to /login.
    secureCookie: process.env.NODE_ENV === "production",
  });

  if (!token || token.role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
