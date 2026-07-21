import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, productWatches } from "@/db/schema";

export async function toggleWatch(
  productId: string,
  userId: string,
  dbc: DBClient = db,
): Promise<{ watching: boolean } | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;

    const inserted = await tx
      .insert(productWatches)
      .values({ productId, userId })
      .onConflictDoNothing()
      .returning({ id: productWatches.id });
    if (inserted.length > 0) return { watching: true };

    await tx
      .delete(productWatches)
      .where(
        and(
          eq(productWatches.productId, productId),
          eq(productWatches.userId, userId),
        ),
      )
      .returning({ id: productWatches.id });
    return { watching: false };
  });
}

export async function isWatching(
  productId: string,
  userId: string,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .select({ id: productWatches.id })
    .from(productWatches)
    .where(
      and(
        eq(productWatches.productId, productId),
        eq(productWatches.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function unsubscribeByToken(
  token: string,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .delete(productWatches)
    .where(eq(productWatches.unsubscribeToken, token))
    .returning({ id: productWatches.id });
  return rows.length > 0;
}
