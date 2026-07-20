import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories } from "@/db/schema";
import { createProduct, approveProduct, getProductBySlug } from "./products";
import { toggleVote, getVotedProductIds } from "./votes";

let db: TestDb;
let userId: string;
let catId: string;

beforeEach(async () => {
  db = await createTestDb();
  userId = (await seedTestUser(db, { name: "Voter" })).id;
  const [cat] = await db
    .insert(categories)
    .values({ slug: "ai", nameId: "AI", nameEn: "AI" })
    .returning({ id: categories.id });
  catId = cat.id;
});

async function makeProduct(name: string, approve = true) {
  const makerId = (await seedTestUser(db)).id;
  const p = await createProduct(
    {
      name,
      taglineId: "t",
      websiteUrl: "https://x.id",
      screenshotUrls: [],
      categoryIds: [catId],
      makerId,
    },
    db,
  );
  if (approve) await approveProduct(p.id, db);
  return p;
}

describe("toggleVote", () => {
  it("adds a vote and increments the count", async () => {
    const p = await makeProduct("Alpha");
    const r = await toggleVote(p.id, userId, db);
    expect(r).toEqual({ voted: true, voteCount: 1 });
    const detail = await getProductBySlug(p.slug, db);
    expect(detail!.product.voteCount).toBe(1);
  });

  it("removes the vote on second toggle", async () => {
    const p = await makeProduct("Beta");
    await toggleVote(p.id, userId, db);
    const r = await toggleVote(p.id, userId, db);
    expect(r).toEqual({ voted: false, voteCount: 0 });
    const detail = await getProductBySlug(p.slug, db);
    expect(detail!.product.voteCount).toBe(0);
  });

  it("counts votes from different users independently", async () => {
    const p = await makeProduct("Gamma");
    const other = (await seedTestUser(db)).id;
    await toggleVote(p.id, userId, db);
    const r = await toggleVote(p.id, other, db);
    expect(r).toEqual({ voted: true, voteCount: 2 });
  });

  it("returns null and changes nothing for a pending product", async () => {
    const p = await makeProduct("Delta", false);
    expect(await toggleVote(p.id, userId, db)).toBeNull();
    const detail = await getProductBySlug(p.slug, db);
    expect(detail!.product.voteCount).toBe(0);
  });

  it("returns null for an unknown product", async () => {
    expect(await toggleVote("nope", userId, db)).toBeNull();
  });
});

describe("getVotedProductIds", () => {
  it("returns only the products this user voted for", async () => {
    const a = await makeProduct("A");
    const b = await makeProduct("B");
    await toggleVote(a.id, userId, db);
    const set = await getVotedProductIds(userId, [a.id, b.id], db);
    expect(set.has(a.id)).toBe(true);
    expect(set.has(b.id)).toBe(false);
  });

  it("returns an empty set for empty input", async () => {
    expect((await getVotedProductIds(userId, [], db)).size).toBe(0);
  });
});
