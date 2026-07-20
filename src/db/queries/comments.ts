import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { comments, products, users } from "@/db/schema";

export type CommentItem = {
  id: string;
  parentId: string | null;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
};

export async function createComment(
  data: { productId: string; userId: string; body: string; parentId?: string },
  dbc: DBClient = db,
): Promise<{ id: string } | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, data.productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;

    if (data.parentId) {
      const [parent] = await tx
        .select({
          productId: comments.productId,
          parentId: comments.parentId,
        })
        .from(comments)
        .where(eq(comments.id, data.parentId))
        .limit(1);
      // One-level threading: parent must exist, on the same product,
      // and itself be a top-level comment.
      if (
        !parent ||
        parent.productId !== data.productId ||
        parent.parentId !== null
      ) {
        return null;
      }
    }

    const [row] = await tx
      .insert(comments)
      .values({
        productId: data.productId,
        userId: data.userId,
        body: data.body,
        parentId: data.parentId ?? null,
      })
      .returning({ id: comments.id });

    await tx
      .update(products)
      .set({ commentCount: sql`${products.commentCount} + 1` })
      .where(eq(products.id, data.productId));

    return row;
  });
}

export async function listComments(
  productId: string,
  dbc: DBClient = db,
): Promise<CommentItem[]> {
  const rows = await dbc
    .select({
      id: comments.id,
      parentId: comments.parentId,
      body: comments.body,
      isDeleted: comments.isDeleted,
      createdAt: comments.createdAt,
      authorId: comments.userId,
      authorName: users.name,
      authorImage: users.image,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.productId, productId))
    .orderBy(asc(comments.createdAt));
  // Soft-deleted bodies must never reach the client.
  return rows.map((r) => (r.isDeleted ? { ...r, body: "" } : r));
}

export async function softDeleteComment(
  commentId: string,
  requesterId: string,
  requesterIsAdmin: boolean,
  dbc: DBClient = db,
): Promise<boolean> {
  return dbc.transaction(async (tx) => {
    const [c] = await tx
      .select({
        userId: comments.userId,
        productId: comments.productId,
        isDeleted: comments.isDeleted,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!c || c.isDeleted) return false;
    if (c.userId !== requesterId && !requesterIsAdmin) return false;

    await tx
      .update(comments)
      .set({ isDeleted: true })
      .where(eq(comments.id, commentId));
    await tx
      .update(products)
      .set({ commentCount: sql`${products.commentCount} - 1` })
      .where(eq(products.id, c.productId));
    return true;
  });
}
