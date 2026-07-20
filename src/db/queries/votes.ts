import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, votes } from "@/db/schema";

export type VoteResult = { voted: boolean; voteCount: number };

export async function toggleVote(
  productId: string,
  userId: string,
  dbc: DBClient = db,
): Promise<VoteResult | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;

    const inserted = await tx
      .insert(votes)
      .values({ productId, userId })
      .onConflictDoNothing()
      .returning({ id: votes.id });

    const voted = inserted.length > 0;
    if (!voted) {
      await tx
        .delete(votes)
        .where(and(eq(votes.productId, productId), eq(votes.userId, userId)));
    }

    const [updated] = await tx
      .update(products)
      .set({ voteCount: sql`${products.voteCount} + ${voted ? 1 : -1}` })
      .where(eq(products.id, productId))
      .returning({ voteCount: products.voteCount });

    return { voted, voteCount: updated.voteCount };
  });
}

export async function getVotedProductIds(
  userId: string,
  productIds: string[],
  dbc: DBClient = db,
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await dbc
    .select({ productId: votes.productId })
    .from(votes)
    .where(and(eq(votes.userId, userId), inArray(votes.productId, productIds)));
  return new Set(rows.map((r) => r.productId));
}
