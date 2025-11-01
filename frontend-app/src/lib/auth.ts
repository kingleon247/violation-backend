import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

import { db } from "@db/config/configureClient";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@db/migrations/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const ALLOWED_EMAILS: string[] = (process.env.ALLOWED_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// (keep your existing ensureFirstUserAdmin etc. if you want; leaving intact)

async function ensureFirstUserAdmin(
  email: string,
  name?: string | null,
  image?: string | null
) {
  const all = await db.select().from(users);
  if (all.length === 0) {
    await db.insert(users).values({
      id: crypto.randomUUID(),
      name: name ?? null,
      firstName: name?.split(" ")[0] ?? null,
      lastName: name?.split(" ").slice(1).join(" ") || null,
      email,
      image: image ?? null,
      role: "admin",
      isAuthorized: true,
    });
    return true;
  }
  return false;
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  pages: { signIn: "/login" },
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 7 },

  callbacks: {
    async signIn({ user }) {
      const email = user?.email;
      if (!email) return false;

      const boot = await ensureFirstUserAdmin(
        email,
        user.name ?? null,
        user.image ?? null
      );
      if (boot) return true;

      let dbUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (!dbUser) {
        await db.insert(users).values({
          id: user.id || crypto.randomUUID(),
          name: user.name ?? null,
          firstName: user.name?.split(" ")[0] ?? null,
          lastName: user.name?.split(" ").slice(1).join(" ") || null,
          email,
          image: user.image ?? null,
          role: "pending",
          isAuthorized: false,
        });

        dbUser = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
      }

      if (ALLOWED_EMAILS.includes(email.toLowerCase())) {
        if (dbUser && (!dbUser.isAuthorized || dbUser.role === "pending")) {
          await db
            .update(users)
            .set({ isAuthorized: true, role: dbUser.role ?? "admin" })
            .where(eq(users.email, email));
        }
        return true;
      }

      return !!dbUser?.isAuthorized;
    },

    async session({ session }) {
      const email = session.user?.email;
      if (!email) return session;

      const dbUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (dbUser) {
        (session.user as any).id = dbUser.id;
        (session.user as any).role = dbUser.role ?? "pending";
        (session.user as any).isAuthorized = !!dbUser.isAuthorized;
      }
      return session;
    },
  },
};

// v4: export only authOptions from this file
export default NextAuth;
