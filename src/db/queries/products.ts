import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import {
  products,
  productImages,
  productCategories,
  categories,
  users,
} from "@/db/schema";
import { slugify, ensureUniqueSlug } from "@/lib/slug";

export type NewProductData = {
  name: string;
  taglineId?: string;
  taglineEn?: string;
  descriptionId?: string;
  descriptionEn?: string;
  websiteUrl: string;
  logoUrl?: string;
  screenshotUrls: string[];
  categoryIds: string[];
  makerId: string;
};

export type FeedSort = "popular" | "newest";

export async function slugExists(
  slug: string,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function createProduct(data: NewProductData, dbc: DBClient = db) {
  const base = slugify(data.name) || "produk";
  const slug = await ensureUniqueSlug(base, (s) => slugExists(s, dbc));

  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        slug,
        name: data.name,
        taglineId: data.taglineId ?? null,
        taglineEn: data.taglineEn ?? null,
        descriptionId: data.descriptionId ?? null,
        descriptionEn: data.descriptionEn ?? null,
        websiteUrl: data.websiteUrl,
        logoUrl: data.logoUrl ?? null,
        makerId: data.makerId,
      })
      .returning({ id: products.id, slug: products.slug });

    if (data.screenshotUrls.length > 0) {
      await tx.insert(productImages).values(
        data.screenshotUrls.map((url, i) => ({
          productId: product.id,
          url,
          sortOrder: i,
        })),
      );
    }
    await tx.insert(productCategories).values(
      data.categoryIds.map((categoryId) => ({
        productId: product.id,
        categoryId,
      })),
    );
    return product;
  });
}

const feedColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  taglineId: products.taglineId,
  taglineEn: products.taglineEn,
  logoUrl: products.logoUrl,
  voteCount: products.voteCount,
  commentCount: products.commentCount,
  launchedAt: products.launchedAt,
  makerName: users.name,
};

export type FeedItem = {
  id: string;
  slug: string;
  name: string;
  taglineId: string | null;
  taglineEn: string | null;
  logoUrl: string | null;
  voteCount: number;
  commentCount: number;
  launchedAt: Date | null;
  makerName: string | null;
};

export async function listFeed(
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
    .where(eq(products.status, "approved"))
    .orderBy(...order)
    .limit(50);
}

export type ProductDetail = {
  product: typeof products.$inferSelect;
  makerName: string | null;
  images: { url: string; sortOrder: number }[];
  categories: { slug: string; nameId: string; nameEn: string }[];
};

export async function getProductBySlug(
  slug: string,
  dbc: DBClient = db,
): Promise<ProductDetail | null> {
  const rows = await dbc
    .select({ product: products, makerName: users.name })
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(eq(products.slug, slug))
    .limit(1);
  if (rows.length === 0) return null;
  const { product, makerName } = rows[0];

  const images = await dbc
    .select({ url: productImages.url, sortOrder: productImages.sortOrder })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.sortOrder));

  const cats = await dbc
    .select({
      slug: categories.slug,
      nameId: categories.nameId,
      nameEn: categories.nameEn,
    })
    .from(productCategories)
    .innerJoin(categories, eq(productCategories.categoryId, categories.id))
    .where(eq(productCategories.productId, product.id))
    .orderBy(asc(categories.slug));

  return { product, makerName, images, categories: cats };
}

export type PendingItem = {
  id: string;
  slug: string;
  name: string;
  taglineId: string | null;
  taglineEn: string | null;
  websiteUrl: string;
  logoUrl: string | null;
  createdAt: Date;
  makerName: string | null;
};

export async function listPending(dbc: DBClient = db): Promise<PendingItem[]> {
  return dbc
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      taglineId: products.taglineId,
      taglineEn: products.taglineEn,
      websiteUrl: products.websiteUrl,
      logoUrl: products.logoUrl,
      createdAt: products.createdAt,
      makerName: users.name,
    })
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(eq(products.status, "pending"))
    .orderBy(asc(products.createdAt));
}

export async function approveProduct(
  id: string,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .update(products)
    .set({ status: "approved", launchedAt: sql`now()` })
    .where(and(eq(products.id, id), eq(products.status, "pending")))
    .returning({ id: products.id });
  return rows.length > 0;
}

export async function rejectProduct(
  id: string,
  reason: string | null,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .update(products)
    .set({ status: "rejected", rejectionReason: reason })
    .where(and(eq(products.id, id), eq(products.status, "pending")))
    .returning({ id: products.id });
  return rows.length > 0;
}
