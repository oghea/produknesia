import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, users, votes } from "@/db/schema";
import { ensureUniqueSlug } from "@/lib/slug";
import { usernameBase } from "@/lib/username";
import { feedColumns, type FeedItem } from "./products";

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

export type ProfileUser = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  bio: string | null;
  createdAt: Date;
};

export async function getUserByUsername(
  username: string,
  dbc: DBClient = db,
): Promise<ProfileUser | null> {
  const rows = await dbc
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      bio: users.bio,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export type MakerProduct = FeedItem & { status: string };

export async function listProductsByMaker(
  makerId: string,
  includeNonApproved: boolean,
  dbc: DBClient = db,
): Promise<MakerProduct[]> {
  const cond = includeNonApproved
    ? eq(products.makerId, makerId)
    : and(eq(products.makerId, makerId), eq(products.status, "approved"));
  return dbc
    .select({ ...feedColumns, status: products.status })
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(cond)
    .orderBy(desc(products.createdAt))
    .limit(50);
}

export async function listVotedProducts(
  userId: string,
  dbc: DBClient = db,
): Promise<FeedItem[]> {
  return dbc
    .select(feedColumns)
    .from(votes)
    .innerJoin(products, eq(votes.productId, products.id))
    .innerJoin(users, eq(products.makerId, users.id))
    .where(and(eq(votes.userId, userId), eq(products.status, "approved")))
    .orderBy(desc(votes.createdAt))
    .limit(50);
}
