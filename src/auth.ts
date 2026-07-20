import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/db/schema";
import { assignUsername } from "@/db/queries/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [Google],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      session.user.username = user.username;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      try {
        await assignUsername(user.id);
      } catch (error) {
        // Username assignment must never break sign-up; the
        // db:backfill-usernames script covers any missed rows.
        console.error("assignUsername failed during sign-up:", error);
      }
    },
  },
});
