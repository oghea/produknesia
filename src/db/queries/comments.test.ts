import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories } from "@/db/schema";
import { createProduct, approveProduct, getProductBySlug } from "./products";
import { createComment, listComments, softDeleteComment } from "./comments";

let db: TestDb;
let userId: string;
let productId: string;
let productSlug: string;

beforeEach(async () => {
  db = await createTestDb();
  userId = (await seedTestUser(db, { name: "Commenter" })).id;
  const [cat] = await db
    .insert(categories)
    .values({ slug: "ai", nameId: "AI", nameEn: "AI" })
    .returning({ id: categories.id });
  const makerId = (await seedTestUser(db)).id;
  const p = await createProduct(
    {
      name: "Kopi Kirim",
      taglineId: "t",
      websiteUrl: "https://x.id",
      screenshotUrls: [],
      categoryIds: [cat.id],
      makerId,
    },
    db,
  );
  await approveProduct(p.id, db);
  productId = p.id;
  productSlug = p.slug;
});

async function commentCount() {
  return (await getProductBySlug(productSlug, db))!.product.commentCount;
}

describe("createComment", () => {
  it("creates a top-level comment and increments the count", async () => {
    const c = await createComment({ productId, userId, body: "Keren!" }, db);
    expect(c).not.toBeNull();
    expect(await commentCount()).toBe(1);
    const list = await listComments(productId, db);
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe("Keren!");
    expect(list[0].authorName).toBe("Commenter");
    expect(list[0].parentId).toBeNull();
  });

  it("creates a one-level reply", async () => {
    const top = await createComment({ productId, userId, body: "Top" }, db);
    const reply = await createComment(
      { productId, userId, body: "Reply", parentId: top!.id },
      db,
    );
    expect(reply).not.toBeNull();
    const list = await listComments(productId, db);
    expect(list.find((c) => c.id === reply!.id)!.parentId).toBe(top!.id);
    expect(await commentCount()).toBe(2);
  });

  it("rejects a reply to a reply", async () => {
    const top = await createComment({ productId, userId, body: "Top" }, db);
    const reply = await createComment(
      { productId, userId, body: "Reply", parentId: top!.id },
      db,
    );
    const nested = await createComment(
      { productId, userId, body: "Nested", parentId: reply!.id },
      db,
    );
    expect(nested).toBeNull();
    expect(await commentCount()).toBe(2);
  });

  it("rejects a parent from another product", async () => {
    const top = await createComment({ productId, userId, body: "Top" }, db);
    const [cat] = await db
      .insert(categories)
      .values({ slug: "saas", nameId: "SaaS", nameEn: "SaaS" })
      .returning({ id: categories.id });
    const otherMaker = (await seedTestUser(db)).id;
    const other = await createProduct(
      {
        name: "Other",
        taglineId: "t",
        websiteUrl: "https://y.id",
        screenshotUrls: [],
        categoryIds: [cat.id],
        makerId: otherMaker,
      },
      db,
    );
    await approveProduct(other.id, db);
    const cross = await createComment(
      { productId: other.id, userId, body: "Cross", parentId: top!.id },
      db,
    );
    expect(cross).toBeNull();
  });

  it("rejects comments on a non-approved product", async () => {
    const makerId = (await seedTestUser(db)).id;
    const [cat] = await db
      .insert(categories)
      .values({ slug: "game", nameId: "Game", nameEn: "Games" })
      .returning({ id: categories.id });
    const pending = await createProduct(
      {
        name: "Pending",
        taglineId: "t",
        websiteUrl: "https://z.id",
        screenshotUrls: [],
        categoryIds: [cat.id],
        makerId,
      },
      db,
    );
    expect(
      await createComment({ productId: pending.id, userId, body: "x" }, db),
    ).toBeNull();
  });
});

describe("softDeleteComment", () => {
  it("author can delete; body is scrubbed in listings; count decrements", async () => {
    const c = await createComment({ productId, userId, body: "Secret" }, db);
    expect(await softDeleteComment(c!.id, userId, false, db)).toBe(true);
    const list = await listComments(productId, db);
    expect(list[0].isDeleted).toBe(true);
    expect(list[0].body).toBe("");
    expect(await commentCount()).toBe(0);
  });

  it("another user cannot delete", async () => {
    const c = await createComment({ productId, userId, body: "Mine" }, db);
    const other = (await seedTestUser(db)).id;
    expect(await softDeleteComment(c!.id, other, false, db)).toBe(false);
    expect(await commentCount()).toBe(1);
  });

  it("an admin can delete someone else's comment", async () => {
    const c = await createComment({ productId, userId, body: "Spam" }, db);
    const admin = (await seedTestUser(db, { role: "admin" })).id;
    expect(await softDeleteComment(c!.id, admin, true, db)).toBe(true);
  });

  it("double delete returns false and does not double-decrement", async () => {
    const c = await createComment({ productId, userId, body: "Once" }, db);
    await softDeleteComment(c!.id, userId, false, db);
    expect(await softDeleteComment(c!.id, userId, false, db)).toBe(false);
    expect(await commentCount()).toBe(0);
  });
});

describe("listComments", () => {
  it("orders by createdAt ascending", async () => {
    await createComment({ productId, userId, body: "first" }, db);
    await createComment({ productId, userId, body: "second" }, db);
    const list = await listComments(productId, db);
    expect(list.map((c) => c.body)).toEqual(["first", "second"]);
  });
});
