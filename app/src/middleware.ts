import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-edge";

const PUBLIC_PATHS = ["/login", "/sw.js", "/favicon.ico", "/icon.png"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next");
  if (isPublic) return NextResponse.next();
  if (!req.auth?.user) {
    const login = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
