import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories, productWatches } from "@/db/schema";
import { createProduct, approveProduct } from "./products";
import { toggleWatch, isWatching, unsubscribeByToken } from "./watches";

let db: TestDb;
let userId: string;
let productId: string;

beforeEach(async () => {
  db = await createTestDb();
  userId = (await seedTestUser(db, { email: "w@test.local" })).id;
  const maker = (await seedTestUser(db)).id;
  const [cat] = await db
    .insert(categories)
    .values({ slug: "ai", nameId: "AI", nameEn: "AI" })
    .returning({ id: categories.id });
  const p = await createProduct(
    {
      name: "Kopi Kirim",
      taglineId: "t",
      websiteUrl: "https://x.id",
      screenshotUrls: [],
      categoryIds: [cat.id],
      makerId: maker,
    },
    db,
  );
  await approveProduct(p.id, db);
  productId = p.id;
});

describe("toggleWatch", () => {
  it("watches and unwatches", async () => {
    expect(await toggleWatch(productId, userId, db)).toEqual({
      watching: true,
    });
    expect(await isWatching(productId, userId, db)).toBe(true);
    expect(await toggleWatch(productId, userId, db)).toEqual({
      watching: false,
    });
    expect(await isWatching(productId, userId, db)).toBe(false);
  });

  it("returns null for a non-approved product", async () => {
    const maker = (await seedTestUser(db)).id;
    const [cat] = await db
      .insert(categories)
      .values({ slug: "saas", nameId: "S", nameEn: "S" })
      .returning({ id: categories.id });
    const pending = await createProduct(
      {
        name: "P",
        taglineId: "t",
        websiteUrl: "https://y.id",
        screenshotUrls: [],
        categoryIds: [cat.id],
        makerId: maker,
      },
      db,
    );
    expect(await toggleWatch(pending.id, userId, db)).toBeNull();
  });
});

describe("unsubscribeByToken", () => {
  it("deletes the watch by its token, once", async () => {
    await toggleWatch(productId, userId, db);
    const [row] = await db
      .select({ token: productWatches.unsubscribeToken })
      .from(productWatches)
      .where(eq(productWatches.userId, userId));
    expect(await unsubscribeByToken(row.token, db)).toBe(true);
    expect(await isWatching(productId, userId, db)).toBe(false);
    expect(await unsubscribeByToken(row.token, db)).toBe(false);
  });

  it("returns false for an unknown token", async () => {
    expect(await unsubscribeByToken("nope", db)).toBe(false);
  });
});
