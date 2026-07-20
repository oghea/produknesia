import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { users } from "@/db/schema";
import { ensureUniqueSlug } from "@/lib/slug";
import { usernameBase } from "@/lib/username";

export async function assignUsername(
  userId: string,
  dbc: DBClient = db,
): Promise<string | null> {
  const [u] = await dbc
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;
  if (u.username) return u.username;

  const base = usernameBase(u.name, u.email);
  const username = await ensureUniqueSlug(base, async (candidate) => {
    const rows = await dbc
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    return rows.length > 0;
  });
  await dbc.update(users).set({ username }).where(eq(users.id, userId));
  return username;
}
