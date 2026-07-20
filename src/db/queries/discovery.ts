import { desc, eq, ilike, or, and } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { categories, productCategories, products, users } from "@/db/schema";
import { feedColumns, type FeedItem, type FeedSort } from "./products";

export async function getCategoryBySlug(slug: string, dbc: DBClient = db) {
  const rows = await dbc
    .select({
      id: categories.id,
      slug: categories.slug,
      nameId: categories.nameId,
      nameEn: categories.nameEn,
    })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProductsByCategory(
  categoryId: string,
  sort: FeedSort,
  dbc: DBClient = db,
): Promise<FeedItem[]> {
  const order =
    sort === "popular"
      ? [desc(products.voteCount), desc(products.launchedAt)]
      : [desc(products.launchedAt)];
  return dbc
    .select(feedColumns)
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .innerJoin(productCategories, eq(productCategories.productId, products.id))
    .where(
      and(
        eq(products.status, "approved"),
        eq(productCategories.categoryId, categoryId),
      ),
    )
    .orderBy(...order)
    .limit(50);
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export async function searchProducts(
  query: string,
  dbc: DBClient = db,
): Promise<FeedItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${escapeLikePattern(q)}%`;
  return dbc
    .select(feedColumns)
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(
      and(
        eq(products.status, "approved"),
        or(
          ilike(products.name, pattern),
          ilike(products.taglineId, pattern),
          ilike(products.taglineEn, pattern),
        ),
      ),
    )
    .orderBy(desc(products.voteCount))
    .limit(20);
}
