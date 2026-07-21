import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, productUpdates, productWatches, users } from "@/db/schema";

export type NewUpdateData = {
  productId: string;
  authorId: string;
  version?: string;
  titleId?: string;
  titleEn?: string;
  bodyId?: string;
  bodyEn?: string;
};

export type UpdateItem = typeof productUpdates.$inferSelect;

export async function createUpdate(
  data: NewUpdateData,
  authorIsAdmin: boolean,
  dbc: DBClient = db,
): Promise<{ id: string } | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status, makerId: products.makerId })
      .from(products)
      .where(eq(products.id, data.productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;
    if (product.makerId !== data.authorId && !authorIsAdmin) return null;

    const [row] = await tx
      .insert(productUpdates)
      .values({
        productId: data.productId,
        authorId: data.authorId,
        version: data.version ?? null,
        titleId: data.titleId ?? null,
        titleEn: data.titleEn ?? null,
        bodyId: data.bodyId ?? null,
        bodyEn: data.bodyEn ?? null,
      })
      .returning({ id: productUpdates.id });
    return row;
  });
}

export async function listUpdatesForProduct(
  productId: string,
  includeNonApproved: boolean,
  dbc: DBClient = db,
): Promise<UpdateItem[]> {
  const cond = includeNonApproved
    ? eq(productUpdates.productId, productId)
    : and(
        eq(productUpdates.productId, productId),
        eq(productUpdates.status, "approved"),
      );
  return dbc
    .select()
    .from(productUpdates)
    .where(cond)
    .orderBy(
      desc(sql`coalesce(${productUpdates.publishedAt}, ${productUpdates.createdAt})`),
    )
    .limit(50);
}

export type PendingUpdateItem = UpdateItem & {
  productName: string;
  productSlug: string;
  authorName: string | null;
};

export async function listPendingUpdates(
  dbc: DBClient = db,
): Promise<PendingUpdateItem[]> {
  const rows = await dbc
    .select({
      update: productUpdates,
      productName: products.name,
      productSlug: products.slug,
      authorName: users.name,
    })
    .from(productUpdates)
    .innerJoin(products, eq(productUpdates.productId, products.id))
    .innerJoin(users, eq(productUpdates.authorId, users.id))
    .where(eq(productUpdates.status, "pending"))
    .orderBy(asc(productUpdates.createdAt));
  return rows.map((r) => ({ ...r.update, productName: r.productName, productSlug: r.productSlug, authorName: r.authorName }));
}

export type ApprovedUpdatePayload = {
  update: UpdateItem;
  productName: string;
  productSlug: string;
  watchers: { email: string; unsubscribeToken: string }[];
};

export async function approveUpdate(
  id: string,
  dbc: DBClient = db,
): Promise<ApprovedUpdatePayload | null> {
  return dbc.transaction(async (tx) => {
    const rows = await tx
      .update(productUpdates)
      .set({ status: "approved", publishedAt: sql`now()` })
      .where(and(eq(productUpdates.id, id), eq(productUpdates.status, "pending")))
      .returning();
    if (rows.length === 0) return null;
    const update = rows[0];

    const [product] = await tx
      .select({ name: products.name, slug: products.slug })
      .from(products)
      .where(eq(products.id, update.productId))
      .limit(1);

    const watchers = await tx
      .select({
        email: users.email,
        unsubscribeToken: productWatches.unsubscribeToken,
      })
      .from(productWatches)
      .innerJoin(users, eq(productWatches.userId, users.id))
      .where(eq(productWatches.productId, update.productId));

    return {
      update,
      productName: product.name,
      productSlug: product.slug,
      watchers: watchers.filter(
        (w): w is { email: string; unsubscribeToken: string } => !!w.email,
      ),
    };
  });
}

export async function rejectUpdate(
  id: string,
  reason: string | null,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .update(productUpdates)
    .set({ status: "rejected", rejectionReason: reason })
    .where(and(eq(productUpdates.id, id), eq(productUpdates.status, "pending")))
    .returning({ id: productUpdates.id });
  return rows.length > 0;
}
