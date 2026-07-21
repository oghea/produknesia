import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { categories, invites } from "@/db/schema";
import { getProductBySlug } from "./products";
import {
  createInvite,
  getOpenInviteByToken,
  listInvites,
  claimInvite,
} from "./invites";
import type { InviteDraft } from "@/lib/validation";

let db: TestDb;
let adminId: string;
let catId: string;

beforeEach(async () => {
  db = await createTestDb();
  adminId = (await seedTestUser(db, { role: "admin", name: "Admin" })).id;
  const [cat] = await db
    .insert(categories)
    .values({ slug: "ai", nameId: "AI", nameEn: "AI" })
    .returning({ id: categories.id });
  catId = cat.id;
});

function draft(): InviteDraft {
  return {
    name: "Kopi Kirim",
    taglineId: "Kirim kopi",
    websiteUrl: "https://kopikirim.id",
    categoryIds: [catId],
    logoUrl: "/uploads/logo.png",
    screenshotUrls: ["/uploads/s1.png"],
  };
}

describe("createInvite + getOpenInviteByToken", () => {
  it("creates an open invite retrievable by token", async () => {
    const inv = await createInvite(
      { draft: draft(), note: "For Budi", createdBy: adminId },
      db,
    );
    const open = await getOpenInviteByToken(inv.token, db);
    expect(open).not.toBeNull();
    expect(open!.note).toBe("For Budi");
  });

  it("returns null for expired invites", async () => {
    const inv = await createInvite(
      { draft: draft(), createdBy: adminId, expiresInDays: -1 },
      db,
    );
    expect(await getOpenInviteByToken(inv.token, db)).toBeNull();
  });

  it("returns null for unknown tokens", async () => {
    expect(await getOpenInviteByToken("nope", db)).toBeNull();
  });
});

describe("claimInvite", () => {
  it("creates an approved product owned by the claimer and closes the invite", async () => {
    const inv = await createInvite({ draft: draft(), createdBy: adminId }, db);
    const claimer = (await seedTestUser(db, { name: "Budi" })).id;
    const result = await claimInvite(
      { token: inv.token, userId: claimer, data: draft() },
      db,
    );
    expect(result).not.toBeNull();
    const detail = await getProductBySlug(result!.slug, db);
    expect(detail!.product.status).toBe("approved");
    expect(detail!.product.launchedAt).toBeInstanceOf(Date);
    expect(detail!.product.makerId).toBe(claimer);
    expect(detail!.images).toHaveLength(1);
    expect(detail!.categories[0].slug).toBe("ai");
    expect(await getOpenInviteByToken(inv.token, db)).toBeNull();
    const [row] = await db.select().from(invites).where(eq(invites.id, inv.id));
    expect(row.claimedBy).toBe(claimer);
    expect(row.claimedProductId).toBe(result!.productId);
  });

  it("cannot be claimed twice", async () => {
    const inv = await createInvite({ draft: draft(), createdBy: adminId }, db);
    const a = (await seedTestUser(db)).id;
    const b = (await seedTestUser(db)).id;
    expect(
      await claimInvite({ token: inv.token, userId: a, data: draft() }, db),
    ).not.toBeNull();
    expect(
      await claimInvite({ token: inv.token, userId: b, data: draft() }, db),
    ).toBeNull();
  });

  it("rejects an expired claim", async () => {
    const inv = await createInvite(
      { draft: draft(), createdBy: adminId, expiresInDays: -1 },
      db,
    );
    const a = (await seedTestUser(db)).id;
    expect(
      await claimInvite({ token: inv.token, userId: a, data: draft() }, db),
    ).toBeNull();
  });
});

describe("listInvites", () => {
  it("lists newest first with claimer name", async () => {
    const inv = await createInvite({ draft: draft(), createdBy: adminId }, db);
    const claimer = (await seedTestUser(db, { name: "Budi" })).id;
    await claimInvite({ token: inv.token, userId: claimer, data: draft() }, db);
    const list = await listInvites(db);
    expect(list).toHaveLength(1);
    expect(list[0].claimedByName).toBe("Budi");
  });
});
