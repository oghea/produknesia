import type { Session } from "next-auth";

export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

export function assertAdmin(
  session: Session | null,
): asserts session is Session {
  if (!isAdmin(session)) throw new Error("FORBIDDEN");
}
