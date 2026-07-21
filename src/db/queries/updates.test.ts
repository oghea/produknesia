import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories, productWatches } from "@/db/schema";
import { createProduct, approveProduct } from "./products";
import {
  createUpdate,
  listUpdatesForProduct,
  listPendingUpdates,
  approveUpdate,
  rejectUpdate,
} from "./updates";

let db: TestDb;
let makerId: string;
let productId: string;

beforeEach(async () => {
  db = await createTestDb();
  makerId = (await seedTestUser(db, { name: "Maker" })).id;
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
      makerId,
    },
    db,
  );
  await approveProduct(p.id, db);
  productId = p.id;
});

function upd(over: Record<string, unknown> = {}) {
  return {
    productId,
    authorId: makerId,
    version: "v1.0.0",
    titleId: "Rilis pertama",
    bodyId: "Detail rilis",
    ...over,
  } as Parameters<typeof createUpdate>[0];
}

describe("createUpdate", () => {
  it("creates a pending update for the maker", async () => {
    const u = await createUpdate(upd(), false, db);
    expect(u).not.toBeNull();
    const list = await listUpdatesForProduct(productId, true, db);
    expect(list[0].status).toBe("pending");
    expect(list[0].version).toBe("v1.0.0");
  });

  it("rejects a non-maker non-admin author", async () => {
    const other = (await seedTestUser(db)).id;
    expect(await createUpdate(upd({ authorId: other }), false, db)).toBeNull();
  });

  it("allows an admin author who is not the maker", async () => {
    const admin = (await seedTestUser(db, { role: "admin" })).id;
    expect(
      await createUpdate(upd({ authorId: admin }), true, db),
    ).not.toBeNull();
  });

  it("rejects updates on a non-approved product", async () => {
    const [cat] = await db
      .insert(categories)
      .values({ slug: "saas", nameId: "S", nameEn: "S" })
      .returning({ id: categories.id });
    const pending = await createProduct(
      {
        name: "Pending",
        taglineId: "t",
        websiteUrl: "https://y.id",
        screenshotUrls: [],
        categoryIds: [cat.id],
        makerId,
      },
      db,
    );
    expect(
      await createUpdate(upd({ productId: pending.id }), false, db),
    ).toBeNull();
  });
});

describe("visibility + queue", () => {
  it("public listing hides pending; maker view shows it", async () => {
    await createUpdate(upd(), false, db);
    expect(await listUpdatesForProduct(productId, false, db)).toHaveLength(0);
    expect(await listUpdatesForProduct(productId, true, db)).toHaveLength(1);
  });

  it("listPendingUpdates joins product and author", async () => {
    await createUpdate(upd(), false, db);
    const q = await listPendingUpdates(db);
    expect(q).toHaveLength(1);
    expect(q[0].productName).toBe("Kopi Kirim");
    expect(q[0].authorName).toBe("Maker");
  });
});

describe("approve/reject", () => {
  it("approve sets publishedAt, returns watcher payload, and is once-only", async () => {
    const watcher = await seedTestUser(db, { email: "w@test.local" });
    await db
      .insert(productWatches)
      .values({ productId, userId: watcher.id });
    const u = await createUpdate(upd(), false, db);
    const payload = await approveUpdate(u!.id, db);
    expect(payload).not.toBeNull();
    expect(payload!.update.publishedAt).toBeInstanceOf(Date);
    expect(payload!.productSlug).toBe("kopi-kirim");
    expect(payload!.watchers).toHaveLength(1);
    expect(payload!.watchers[0].email).toBe("w@test.local");
    expect(payload!.watchers[0].unsubscribeToken).toBeTruthy();
    expect(await approveUpdate(u!.id, db)).toBeNull(); // no longer pending
    expect(await listUpdatesForProduct(productId, false, db)).toHaveLength(1);
  });

  it("reject stores the reason and leaves the public list empty", async () => {
    const u = await createUpdate(upd(), false, db);
    expect(await rejectUpdate(u!.id, "Too thin", db)).toBe(true);
    const all = await listUpdatesForProduct(productId, true, db);
    expect(all[0].status).toBe("rejected");
    expect(all[0].rejectionReason).toBe("Too thin");
    expect(await listUpdatesForProduct(productId, false, db)).toHaveLength(0);
  });
});
