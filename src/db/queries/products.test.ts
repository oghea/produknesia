import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories } from "@/db/schema";
import {
  createProduct,
  slugExists,
  listFeed,
  getProductBySlug,
  listPending,
  approveProduct,
  rejectProduct,
  countApprovedProducts,
  listFeedPage,
  FEED_PAGE_SIZE,
} from "./products";
import { listCategories } from "./categories";

let db: TestDb;
let makerId: string;
let catId: string;

beforeEach(async () => {
  db = await createTestDb();
  makerId = (await seedTestUser(db, { name: "Maker" })).id;
  const [cat] = await db
    .insert(categories)
    .values({ slug: "ai", nameId: "AI", nameEn: "AI" })
    .returning({ id: categories.id });
  catId = cat.id;
});

function newProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: "Kopi Kirim",
    taglineId: "Kirim kopi",
    websiteUrl: "https://kopikirim.id",
    screenshotUrls: ["/uploads/a.png", "/uploads/b.png"],
    categoryIds: [catId],
    makerId,
    ...overrides,
  } as Parameters<typeof createProduct>[0];
}

describe("createProduct", () => {
  it("creates a pending product with slug, images, categories", async () => {
    const created = await createProduct(newProduct(), db);
    expect(created.slug).toBe("kopi-kirim");
    const detail = await getProductBySlug("kopi-kirim", db);
    expect(detail).not.toBeNull();
    expect(detail!.product.status).toBe("pending");
    expect(detail!.images.map((i) => i.url)).toEqual([
      "/uploads/a.png",
      "/uploads/b.png",
    ]);
    expect(detail!.categories[0].slug).toBe("ai");
    expect(detail!.makerName).toBe("Maker");
  });

  it("de-duplicates slugs with a counter", async () => {
    await createProduct(newProduct(), db);
    const second = await createProduct(newProduct(), db);
    expect(second.slug).toBe("kopi-kirim-2");
    expect(await slugExists("kopi-kirim", db)).toBe(true);
  });

  it("falls back to 'produk' when the name slugifies to empty", async () => {
    const created = await createProduct(newProduct({ name: "!!!" }), db);
    expect(created.slug).toBe("produk");
  });
});

describe("listFeed", () => {
  it("orders popular by votes and excludes pending", async () => {
    const a = await createProduct(newProduct({ name: "Alpha" }), db);
    const b = await createProduct(newProduct({ name: "Beta" }), db);
    await createProduct(newProduct({ name: "Pending One" }), db);
    await approveProduct(a.id, db);
    await approveProduct(b.id, db);
    // give Beta more votes directly
    const { products } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(products).set({ voteCount: 5 }).where(eq(products.id, b.id));

    const popular = await listFeed("popular", db);
    expect(popular.map((p) => p.name)).toEqual(["Beta", "Alpha"]);

    const newest = await listFeed("newest", db);
    expect(newest).toHaveLength(2); // pending excluded
  });
});

describe("approve/reject", () => {
  it("approve sets launchedAt and only works once", async () => {
    const p = await createProduct(newProduct(), db);
    expect(await approveProduct(p.id, db)).toBe(true);
    const detail = await getProductBySlug(p.slug, db);
    expect(detail!.product.status).toBe("approved");
    expect(detail!.product.launchedAt).toBeInstanceOf(Date);
    expect(await approveProduct(p.id, db)).toBe(false); // no longer pending
  });

  it("reject stores the reason and leaves the pending queue", async () => {
    const p = await createProduct(newProduct(), db);
    expect((await listPending(db)).map((x) => x.id)).toContain(p.id);
    expect(await rejectProduct(p.id, "Spam", db)).toBe(true);
    expect((await listPending(db)).map((x) => x.id)).not.toContain(p.id);
    const detail = await getProductBySlug(p.slug, db);
    expect(detail!.product.status).toBe("rejected");
    expect(detail!.product.rejectionReason).toBe("Spam");
  });
});

describe("countApprovedProducts", () => {
  it("counts only approved products", async () => {
    const a = await createProduct(newProduct({ name: "Live One" }), db);
    await createProduct(newProduct({ name: "Pending One" }), db);
    await approveProduct(a.id, db);
    expect(await countApprovedProducts(db)).toBe(1);
  });

  it("excludes demo products from the count", async () => {
    const a = await createProduct(newProduct({ name: "Live One" }), db);
    const demo = await createProduct(
      newProduct({
        name: "Demo One",
        websiteUrl: "https://demo-one.contoh-demo.id",
      }),
      db,
    );
    await approveProduct(a.id, db);
    await approveProduct(demo.id, db);
    expect(await countApprovedProducts(db)).toBe(1);
  });
});

describe("listCategories", () => {
  it("returns seeded categories ordered by slug", async () => {
    await db
      .insert(categories)
      .values({ slug: "saas", nameId: "SaaS", nameEn: "SaaS" });
    const cats = await listCategories(db);
    expect(cats.map((c) => c.slug)).toEqual(["ai", "saas"]);
  });
});

describe("listFeedPage", () => {
  it("walks pages by cursor without overlap or gaps", async () => {
    const { products } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const made: string[] = [];
    for (let i = 0; i < 35; i++) {
      const p = await createProduct(newProduct({ name: `Feed ${i}` }), db);
      await approveProduct(p.id, db);
      // Distinct launch times so ordering is deterministic.
      await db
        .update(products)
        .set({ launchedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) })
        .where(eq(products.id, p.id));
      made.push(p.id);
    }
    const page1 = await listFeedPage(null, db);
    expect(page1.items).toHaveLength(FEED_PAGE_SIZE);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listFeedPage(page1.nextCursor, db);
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
    const all = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(all).size).toBe(35);
    expect(page1.items[0].name).toBe("Feed 34"); // newest first
  });

  it("treats a garbage cursor as the first page", async () => {
    const p = await createProduct(newProduct({ name: "Solo" }), db);
    await approveProduct(p.id, db);
    const page = await listFeedPage("not_a_cursor", db);
    expect(page.items.map((i) => i.name)).toContain("Solo");
  });

  it("does not drop rows that share a launchedAt timestamp", async () => {
    const { products } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const shared = new Date("2026-01-05T00:00:00.000Z");
    for (let i = 0; i < 35; i++) {
      const p = await createProduct(newProduct({ name: `Tie ${i}` }), db);
      await approveProduct(p.id, db);
      await db.update(products).set({ launchedAt: shared }).where(eq(products.id, p.id));
    }
    const page1 = await listFeedPage(null, db);
    const page2 = await listFeedPage(page1.nextCursor!, db);
    expect(page1.items.length + page2.items.length).toBe(35);
    expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(35);
  });
});
