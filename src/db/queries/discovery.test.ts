import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProduct, approveProduct } from "./products";
import {
  getCategoryBySlug,
  listProductsByCategory,
  searchProducts,
} from "./discovery";
import { getUserByUsername, listProductsByMaker, listVotedProducts } from "./users";
import { toggleVote } from "./votes";

let db: TestDb;
let makerId: string;
let catA: string;
let catB: string;

beforeEach(async () => {
  db = await createTestDb();
  makerId = (await seedTestUser(db, { name: "Maker", username: "maker" })).id;
  const rows = await db
    .insert(categories)
    .values([
      { slug: "ai", nameId: "AI", nameEn: "AI" },
      { slug: "saas", nameId: "SaaS", nameEn: "SaaS" },
    ])
    .returning({ id: categories.id, slug: categories.slug });
  catA = rows.find((r) => r.slug === "ai")!.id;
  catB = rows.find((r) => r.slug === "saas")!.id;
});

async function makeProduct(
  name: string,
  opts: { categoryIds?: string[]; approve?: boolean; taglineId?: string } = {},
) {
  const p = await createProduct(
    {
      name,
      taglineId: opts.taglineId ?? "tagline",
      websiteUrl: "https://x.id",
      screenshotUrls: [],
      categoryIds: opts.categoryIds ?? [catA],
      makerId,
    },
    db,
  );
  if (opts.approve !== false) await approveProduct(p.id, db);
  return p;
}

describe("getCategoryBySlug", () => {
  it("finds a category and returns null for unknown", async () => {
    expect((await getCategoryBySlug("ai", db))!.nameEn).toBe("AI");
    expect(await getCategoryBySlug("nope", db)).toBeNull();
  });
});

describe("listProductsByCategory", () => {
  it("filters by category and excludes pending", async () => {
    await makeProduct("In A", { categoryIds: [catA] });
    await makeProduct("In B", { categoryIds: [catB] });
    await makeProduct("Pending A", { categoryIds: [catA], approve: false });
    const list = await listProductsByCategory(catA, "newest", db);
    expect(list.map((p) => p.name)).toEqual(["In A"]);
  });

  it("orders popular by votes", async () => {
    const a = await makeProduct("Alpha", { categoryIds: [catA] });
    const b = await makeProduct("Beta", { categoryIds: [catA] });
    await db.update(products).set({ voteCount: 9 }).where(eq(products.id, b.id));
    const list = await listProductsByCategory(catA, "popular", db);
    expect(list.map((p) => p.name)).toEqual(["Beta", "Alpha"]);
    expect(a.id).toBeDefined();
  });
});

describe("searchProducts", () => {
  it("matches name and taglines case-insensitively", async () => {
    await makeProduct("Kopi Kirim");
    await makeProduct("Other", { taglineId: "aplikasi kopi terbaik" });
    await makeProduct("Unrelated", { taglineId: "nothing here" });
    const byName = await searchProducts("kOpI", db);
    expect(byName.map((p) => p.name).sort()).toEqual(["Kopi Kirim", "Other"]);
  });

  it("excludes pending products", async () => {
    await makeProduct("Kopi Pending", { approve: false });
    expect(await searchProducts("kopi", db)).toHaveLength(0);
  });

  it("returns [] for short queries without querying", async () => {
    expect(await searchProducts(" k ", db)).toEqual([]);
  });

  it("treats % and _ literally", async () => {
    await makeProduct("100% Halal");
    expect((await searchProducts("100%", db)).map((p) => p.name)).toEqual([
      "100% Halal",
    ]);
    expect(await searchProducts("1__%", db)).toEqual([]);
  });
});

describe("profile queries", () => {
  it("getUserByUsername finds the user", async () => {
    const u = await getUserByUsername("maker", db);
    expect(u!.name).toBe("Maker");
    expect(await getUserByUsername("ghost", db)).toBeNull();
  });

  it("listProductsByMaker hides non-approved unless included", async () => {
    await makeProduct("Live");
    await makeProduct("Draft", { approve: false });
    const pub = await listProductsByMaker(makerId, false, db);
    expect(pub.map((p) => p.name)).toEqual(["Live"]);
    const own = await listProductsByMaker(makerId, true, db);
    expect(own.map((p) => p.name).sort()).toEqual(["Draft", "Live"]);
    expect(own.find((p) => p.name === "Draft")!.status).toBe("pending");
  });

  it("listVotedProducts returns approved products the user voted for", async () => {
    const voter = (await seedTestUser(db, { username: "voter" })).id;
    const a = await makeProduct("Voted");
    await makeProduct("Not Voted");
    await toggleVote(a.id, voter, db);
    const list = await listVotedProducts(voter, db);
    expect(list.map((p) => p.name)).toEqual(["Voted"]);
  });
});
