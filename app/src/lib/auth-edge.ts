// Edge-safe NextAuth instance for middleware: no Prisma/bcrypt imports.
// The credentials `authorize` only runs through the full config in lib/auth.ts;
// middleware only needs to read/verify the JWT session cookie.
import NextAuth from "next-auth";

export const { auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
});
