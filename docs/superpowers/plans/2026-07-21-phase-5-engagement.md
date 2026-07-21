# Phase 5: Engagement & Growth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship product updates (review-queued changelogs), watch-a-product email notifications via Resend, and admin invite links that let real makers claim prefilled, instantly-approved submissions.

**Architecture:** Same layering as Phases 2–4: new tables in one migration; query modules (`updates.ts`, `watches.ts`, `invites.ts`) with `dbc: DBClient = db`, TDD'd on PGlite; server actions compose session/admin checks → zod validation → queries → `revalidatePath`. Email is a thin fetch wrapper over Resend's batch API that no-ops (with a log) when `RESEND_API_KEY` is absent; the fan-out runs in `after()` from `next/server` so it never blocks or breaks the admin's approval action.

**Tech Stack:** Existing stack. No new npm dependencies (Resend is called via `fetch`).

## Global Constraints

- pnpm; TypeScript `strict: true`; Tailwind semantic tokens only; flat buttons (no borders/shadows — see `design-system/MASTER.md`); every user-facing string in BOTH `messages/id.json` and `messages/en.json` (parity test); validation errors are i18n keys.
- All DB access via query functions in `src/db/queries/*` (Drizzle core API, last param `dbc: DBClient = db`); PGlite integration tests only — never the live DB from tests.
- All mutations are server actions re-checking the session; admin actions call `assertAdmin` BEFORE any read/write.
- Denormalized/conditional writes use `.returning()` guards (established pattern) — the claim transaction guards `claimedBy IS NULL`.
- Bilingual update content: `titleId`/`titleEn`, `bodyId`/`bodyEn` — ≥1 language per pair, viewer-locale-with-fallback display; emails use ID-first-EN-fallback.
- Markdown rendered ONLY through the hardened renderer (no rehype-raw; comments-style `img: () => null` + `nofollow ugc` links for update bodies).
- Emails: Resend batch API (chunks of 100), `EMAIL_FROM` default `Produknesia <onboarding@resend.dev>`, absolute links built from `APP_URL` (default `http://localhost:3000`). Email failure is logged, never thrown.
- Locale-prefixed redirects in server actions use `localePath()` from `@/i18n/locale-path`.
- New timestamps: `timestamp("...", { withTimezone: true, mode: "date" })`.

## Prerequisite

`.env.local` has the working Neon `DATABASE_URL` (Task 1 migrates the live dev DB). `RESEND_API_KEY`/`EMAIL_FROM`/`APP_URL` are only needed for the manual email smoke in Task 9 — the email lib no-ops without a key, so Tasks 1–8 don't block on it.

---

### Task 1: Schema migration (three tables)

**Files:**
- Modify: `src/db/schema.ts`
- Test: `src/db/schema.test.ts` (extend)

**Interfaces:**
- Consumes: existing schema helpers (`id()`, `createId`).
- Produces table objects: `productUpdates`, `productWatches`, `invites` (columns below — later tasks import these names).

- [ ] **Step 1: Write failing schema tests**

Append to `src/db/schema.test.ts` (extend the existing imports with `productUpdates, productWatches, invites`):

```ts
describe("phase 5 tables", () => {
  it("productUpdates has status defaulting to pending", () => {
    const cols = getTableColumns(productUpdates);
    expect(cols.status.default).toBe("pending");
    expect(Object.keys(cols)).toEqual(
      expect.arrayContaining([
        "id", "productId", "authorId", "version",
        "titleId", "titleEn", "bodyId", "bodyEn",
        "status", "rejectionReason", "publishedAt", "createdAt",
      ]),
    );
  });

  it("productWatches enforces one watch per user+product", () => {
    const cols = Object.keys(getTableColumns(productWatches));
    expect(cols).toEqual(
      expect.arrayContaining(["productId", "userId", "unsubscribeToken"]),
    );
    const cfg = getTableConfig(productWatches);
    const uniq = cfg.indexes.find((i) => i.config.unique);
    expect(uniq).toBeDefined();
  });

  it("invites carries a jsonb draft and claim columns", () => {
    const cols = Object.keys(getTableColumns(invites));
    expect(cols).toEqual(
      expect.arrayContaining([
        "token", "draft", "note", "createdBy",
        "expiresAt", "claimedBy", "claimedProductId", "claimedAt",
      ]),
    );
  });
});
```

Run: `pnpm test src/db/schema.test.ts` → FAIL (names not exported).

- [ ] **Step 2: Add the tables to `src/db/schema.ts`**

Extend the pg-core import with `jsonb` and `index` (if not present), then append:

```ts
// ---- Phase 5: engagement ----
export const productUpdates = pgTable(
  "product_updates",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: text("version"),
    titleId: text("title_id"),
    titleEn: text("title_en"),
    bodyId: text("body_id"),
    bodyEn: text("body_en"),
    status: text("status").notNull().default("pending"), // pending|approved|rejected
    rejectionReason: text("rejection_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    productStatusIdx: index("product_updates_product_status_idx").on(
      t.productId,
      t.status,
      t.publishedAt,
    ),
    statusIdx: index("product_updates_status_idx").on(t.status),
  }),
);

export const productWatches = pgTable(
  "product_watches",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    unsubscribeToken: text("unsubscribe_token")
      .notNull()
      .unique()
      .$defaultFn(() => createId()),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqUserProduct: uniqueIndex("watches_user_product_uniq").on(
      t.productId,
      t.userId,
    ),
    userIdx: index("watches_user_idx").on(t.userId),
  }),
);

export const invites = pgTable("invites", {
  id: id(),
  token: text("token")
    .notNull()
    .unique()
    .$defaultFn(() => createId()),
  draft: jsonb("draft").notNull(),
  note: text("note"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  claimedBy: text("claimed_by").references(() => users.id),
  claimedProductId: text("claimed_product_id").references(() => products.id),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 3: Run schema tests → PASS**

Run: `pnpm test src/db/schema.test.ts` → PASS.

- [ ] **Step 4: Generate + apply the migration**

Run: `pnpm db:generate` → a new `drizzle/0001_*.sql` appears (do NOT touch 0000).
Inspect it: three `CREATE TABLE`s, the unique watch index, the unique invite token.
Run: `pnpm db:migrate` → applies to the live dev Neon DB.

- [ ] **Step 5: Full suite + commit**

Run: `pnpm test` → all pass (PGlite harness picks up the new migration automatically via `migrationsFolder: "./drizzle"`).

```bash
git add -A
git commit -m "feat: add product_updates, product_watches, invites tables"
```

---

### Task 2: Validation additions (update form + invite draft)

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts` (extend)

**Interfaces:**
- Consumes: existing zod schemas.
- Produces:
  - `productObjectSchema` — the un-refined base object (internal refactor; `productInputSchema` behavior unchanged).
  - `parseUpdateForm(formData): { ok: true; data: UpdateFormData } | { ok: false; errors: Record<string, string> }` with `UpdateFormData = { version?: string; titleId?: string; titleEn?: string; bodyId?: string; bodyEn?: string }` — ≥1 title AND ≥1 body required.
  - `inviteDraftSchema` and `type InviteDraft = ProductInput & { logoUrl?: string; screenshotUrls: string[] }` — validates the jsonb draft on create and claim.

- [ ] **Step 1: Write failing tests**

Append to `src/lib/validation.test.ts`:

```ts
import { parseUpdateForm, inviteDraftSchema } from "./validation";

describe("parseUpdateForm", () => {
  function updForm(entries: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.append(k, v);
    return fd;
  }

  it("accepts version + one-language title/body", () => {
    const r = parseUpdateForm(
      updForm({ version: "v1.2.0", titleId: "Fitur baru", bodyId: "Detail…" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.version).toBe("v1.2.0");
      expect(r.data.titleEn).toBeUndefined();
    }
  });

  it("accepts a missing version", () => {
    expect(
      parseUpdateForm(updForm({ titleEn: "New", bodyEn: "Details" })).ok,
    ).toBe(true);
  });

  it("requires at least one title", () => {
    const r = parseUpdateForm(updForm({ bodyId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.titleId).toBe("validation.updateTitleRequired");
  });

  it("requires at least one body", () => {
    const r = parseUpdateForm(updForm({ titleId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.bodyId).toBe("validation.updateBodyRequired");
  });

  it("rejects an over-long version", () => {
    const r = parseUpdateForm(
      updForm({ version: "v".repeat(31), titleId: "x", bodyId: "y" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.version).toBe("validation.tooLong");
  });
});

describe("inviteDraftSchema", () => {
  const base = {
    name: "Kopi Kirim",
    taglineId: "Kirim kopi",
    websiteUrl: "https://kopikirim.id",
    categoryIds: ["cat1"],
    screenshotUrls: [],
  };

  it("accepts a valid draft with images", () => {
    const r = inviteDraftSchema.safeParse({
      ...base,
      logoUrl: "/uploads/a.png",
      screenshotUrls: ["/uploads/b.png"],
    });
    expect(r.success).toBe(true);
  });

  it("applies the same product rules (scheme check)", () => {
    const r = inviteDraftSchema.safeParse({
      ...base,
      websiteUrl: "javascript:alert(1)",
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 4 screenshots", () => {
    const r = inviteDraftSchema.safeParse({
      ...base,
      screenshotUrls: ["a", "b", "c", "d", "e"],
    });
    expect(r.success).toBe(false);
  });
});
```

Run: `pnpm test src/lib/validation.test.ts` → FAIL (exports missing).

- [ ] **Step 2: Refactor + implement in `src/lib/validation.ts`**

Split the existing schema so the object part is reusable (behavior of
`productInputSchema` and every existing test must stay identical):

```ts
const taglineRefine = {
  check: (d: { taglineId?: string; taglineEn?: string }) =>
    Boolean(d.taglineId || d.taglineEn),
  opts: { message: "validation.taglineRequired", path: ["taglineId"] as const },
};

export const productObjectSchema = z.object({
  // ...move the EXACT existing field definitions here unchanged...
});

export const productInputSchema = productObjectSchema.refine(
  taglineRefine.check,
  taglineRefine.opts,
);
```

Then add:

```ts
export const updateInputSchema = z
  .object({
    version: optionalText(30),
    titleId: optionalText(120),
    titleEn: optionalText(120),
    bodyId: optionalText(5000),
    bodyEn: optionalText(5000),
  })
  .refine((d) => d.titleId || d.titleEn, {
    message: "validation.updateTitleRequired",
    path: ["titleId"],
  })
  .refine((d) => d.bodyId || d.bodyEn, {
    message: "validation.updateBodyRequired",
    path: ["bodyId"],
  });

export type UpdateFormData = z.infer<typeof updateInputSchema>;

export function parseUpdateForm(
  formData: FormData,
):
  | { ok: true; data: UpdateFormData }
  | { ok: false; errors: Record<string, string> } {
  const result = updateInputSchema.safeParse({
    version: formData.get("version") ?? undefined,
    titleId: formData.get("titleId") ?? undefined,
    titleEn: formData.get("titleEn") ?? undefined,
    bodyId: formData.get("bodyId") ?? undefined,
    bodyEn: formData.get("bodyEn") ?? undefined,
  });
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export const inviteDraftSchema = productObjectSchema
  .extend({
    logoUrl: z.string().optional(),
    screenshotUrls: z.array(z.string()).max(4, "validation.screenshotsTooMany"),
  })
  .refine(taglineRefine.check, taglineRefine.opts);

export type InviteDraft = z.infer<typeof inviteDraftSchema>;
```

(`optionalText` already exists. If zod's `.extend` is unavailable on the
version installed, use `productObjectSchema.shape` spread into a new
`z.object` — same result; note the deviation.)

- [ ] **Step 3: Run → PASS; full suite; commit**

Run: `pnpm test src/lib/validation.test.ts` → PASS (existing + 8 new).
Run: `pnpm test` → all pass.

```bash
git add -A
git commit -m "feat: add update-form and invite-draft validation"
```

---

### Task 3: Updates query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/updates.ts`
- Test: `src/db/queries/updates.test.ts`

**Interfaces:**
- Consumes: `DBClient`/`db`, `productUpdates`/`products`/`users`/`productWatches` tables, test harness, products queries as fixtures, `watches` come in Task 5 (this task seeds watch rows directly for the payload test).
- Produces (all take `dbc: DBClient = db` last):
  - `type NewUpdateData = { productId: string; authorId: string; version?: string; titleId?: string; titleEn?: string; bodyId?: string; bodyEn?: string }`
  - `createUpdate(data: NewUpdateData, authorIsAdmin: boolean, dbc?): Promise<{ id: string } | null>` — null (zero writes) unless the product exists, is approved, and the author is its maker or `authorIsAdmin`.
  - `type UpdateItem = typeof productUpdates.$inferSelect`
  - `listUpdatesForProduct(productId: string, includeNonApproved: boolean, dbc?): Promise<UpdateItem[]>` — `createdAt desc`; approved-only unless included.
  - `type PendingUpdateItem = UpdateItem & { productName: string; productSlug: string; authorName: string | null }`
  - `listPendingUpdates(dbc?): Promise<PendingUpdateItem[]>` — `createdAt asc`.
  - `type ApprovedUpdatePayload = { update: UpdateItem; productName: string; productSlug: string; watchers: { email: string; unsubscribeToken: string }[] }`
  - `approveUpdate(id: string, dbc?): Promise<ApprovedUpdatePayload | null>` — pending→approved with `publishedAt = now()` (guarded `.returning()`); null if not pending.
  - `rejectUpdate(id: string, reason: string | null, dbc?): Promise<boolean>` — pending-only, stores reason.

- [ ] **Step 1: Write failing tests**

`src/db/queries/updates.test.ts`:

```ts
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
```

Run: `pnpm test src/db/queries/updates.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `src/db/queries/updates.ts`**

```ts
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, productUpdates, productWatches, users } from "@/db/schema";

export type NewUpdateData = {
  productId: string;
  authorId: string;
  version?: string;
  titleId?: string;
  titleEn?: string;
  bodyId?: string;
  bodyEn?: string;
};

export type UpdateItem = typeof productUpdates.$inferSelect;

export async function createUpdate(
  data: NewUpdateData,
  authorIsAdmin: boolean,
  dbc: DBClient = db,
): Promise<{ id: string } | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status, makerId: products.makerId })
      .from(products)
      .where(eq(products.id, data.productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;
    if (product.makerId !== data.authorId && !authorIsAdmin) return null;

    const [row] = await tx
      .insert(productUpdates)
      .values({
        productId: data.productId,
        authorId: data.authorId,
        version: data.version ?? null,
        titleId: data.titleId ?? null,
        titleEn: data.titleEn ?? null,
        bodyId: data.bodyId ?? null,
        bodyEn: data.bodyEn ?? null,
      })
      .returning({ id: productUpdates.id });
    return row;
  });
}

export async function listUpdatesForProduct(
  productId: string,
  includeNonApproved: boolean,
  dbc: DBClient = db,
): Promise<UpdateItem[]> {
  const cond = includeNonApproved
    ? eq(productUpdates.productId, productId)
    : and(
        eq(productUpdates.productId, productId),
        eq(productUpdates.status, "approved"),
      );
  return dbc
    .select()
    .from(productUpdates)
    .where(cond)
    .orderBy(desc(productUpdates.createdAt))
    .limit(50);
}

export type PendingUpdateItem = UpdateItem & {
  productName: string;
  productSlug: string;
  authorName: string | null;
};

export async function listPendingUpdates(
  dbc: DBClient = db,
): Promise<PendingUpdateItem[]> {
  const rows = await dbc
    .select({
      update: productUpdates,
      productName: products.name,
      productSlug: products.slug,
      authorName: users.name,
    })
    .from(productUpdates)
    .innerJoin(products, eq(productUpdates.productId, products.id))
    .innerJoin(users, eq(productUpdates.authorId, users.id))
    .where(eq(productUpdates.status, "pending"))
    .orderBy(asc(productUpdates.createdAt));
  return rows.map((r) => ({ ...r.update, productName: r.productName, productSlug: r.productSlug, authorName: r.authorName }));
}

export type ApprovedUpdatePayload = {
  update: UpdateItem;
  productName: string;
  productSlug: string;
  watchers: { email: string; unsubscribeToken: string }[];
};

export async function approveUpdate(
  id: string,
  dbc: DBClient = db,
): Promise<ApprovedUpdatePayload | null> {
  return dbc.transaction(async (tx) => {
    const rows = await tx
      .update(productUpdates)
      .set({ status: "approved", publishedAt: sql`now()` })
      .where(and(eq(productUpdates.id, id), eq(productUpdates.status, "pending")))
      .returning();
    if (rows.length === 0) return null;
    const update = rows[0];

    const [product] = await tx
      .select({ name: products.name, slug: products.slug })
      .from(products)
      .where(eq(products.id, update.productId))
      .limit(1);

    const watchers = await tx
      .select({
        email: users.email,
        unsubscribeToken: productWatches.unsubscribeToken,
      })
      .from(productWatches)
      .innerJoin(users, eq(productWatches.userId, users.id))
      .where(eq(productWatches.productId, update.productId));

    return {
      update,
      productName: product.name,
      productSlug: product.slug,
      watchers: watchers.filter(
        (w): w is { email: string; unsubscribeToken: string } => !!w.email,
      ),
    };
  });
}

export async function rejectUpdate(
  id: string,
  reason: string | null,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .update(productUpdates)
    .set({ status: "rejected", rejectionReason: reason })
    .where(and(eq(productUpdates.id, id), eq(productUpdates.status, "pending")))
    .returning({ id: productUpdates.id });
  return rows.length > 0;
}
```

- [ ] **Step 3: Run → PASS (all 8); full suite; commit**

```bash
git add -A
git commit -m "feat: add product updates query layer"
```

---

### Task 4: Update form + product-page Updates section

**Files:**
- Create: `src/app/[locale]/products/[slug]/updates/new/page.tsx`
- Create: `src/components/UpdateForm.tsx`
- Create: `src/components/ProductUpdates.tsx`
- Modify: `src/app/[locale]/products/[slug]/actions.ts` (add `postUpdateAction`)
- Modify: `src/app/[locale]/products/[slug]/page.tsx` (Post-update button + section)
- Modify: `src/lib/locale-content.ts` + `src/lib/locale-content.test.ts` (add `pickLocalizedPair`)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `parseUpdateForm` (T2), `createUpdate`/`listUpdatesForProduct`/`UpdateItem` (T3), `auth`/`isAdmin`, hardened ReactMarkdown pattern, `localePath`.
- Produces:
  - `pickLocalizedPair(idValue: string | null, enValue: string | null, locale: string): string | null` — viewer-locale-first fallback (also used by Task 6 emails? No — emails use ID-first directly; this is UI-only).
  - `postUpdateAction(prev: UpdateState, formData: FormData): Promise<UpdateState>` with `UpdateState = { ok: boolean; errors: Record<string, string> }`.
  - `ProductUpdates({ updates, locale, viewerCanModerate })` server component.

- [ ] **Step 1: TDD `pickLocalizedPair`**

Append to `src/lib/locale-content.test.ts`:

```ts
import { pickLocalizedPair } from "./locale-content";

describe("pickLocalizedPair", () => {
  it("prefers the viewer locale and falls back", () => {
    expect(pickLocalizedPair("halo", null, "en")).toBe("halo");
    expect(pickLocalizedPair("halo", "hello", "en")).toBe("hello");
    expect(pickLocalizedPair(null, "hello", "id")).toBe("hello");
    expect(pickLocalizedPair(null, null, "id")).toBeNull();
  });
});
```

Run → FAIL. Implement in `src/lib/locale-content.ts`:

```ts
export function pickLocalizedPair(
  idValue: string | null,
  enValue: string | null,
  locale: string,
): string | null {
  return locale === "id" ? (idValue ?? enValue) : (enValue ?? idValue);
}
```

Run → PASS.

- [ ] **Step 2: i18n strings (both catalogs; parity green)**

`messages/en.json` — new top-level `updates` object + two `validation` keys:

```json
{
  "updates": {
    "title": "Updates",
    "post": "Post update",
    "formTitle": "Post an update",
    "version": "Version (optional)",
    "titleId": "Title (Indonesian)",
    "titleEn": "Title (English)",
    "bodyId": "What's new (Indonesian, markdown)",
    "bodyEn": "What's new (English, markdown)",
    "pairHint": "Fill at least one language for the title and the body.",
    "send": "Submit for review",
    "success": "Submitted! Your update is waiting for review.",
    "empty": "No updates yet.",
    "pendingBadge": "Under review",
    "rejectedBadge": "Rejected: {reason}",
    "noReason": "not provided"
  }
}
```

```json
{
  "validation": {
    "updateTitleRequired": "Fill in at least one title.",
    "updateBodyRequired": "Fill in at least one body."
  }
}
```

`messages/id.json` — same keys:

```json
{
  "updates": {
    "title": "Pembaruan",
    "post": "Tulis pembaruan",
    "formTitle": "Tulis pembaruan",
    "version": "Versi (opsional)",
    "titleId": "Judul (Bahasa Indonesia)",
    "titleEn": "Judul (Bahasa Inggris)",
    "bodyId": "Apa yang baru (Bahasa Indonesia, markdown)",
    "bodyEn": "Apa yang baru (Bahasa Inggris, markdown)",
    "pairHint": "Isi minimal satu bahasa untuk judul dan isi.",
    "send": "Kirim untuk ditinjau",
    "success": "Terkirim! Pembaruanmu sedang menunggu peninjauan.",
    "empty": "Belum ada pembaruan.",
    "pendingBadge": "Sedang ditinjau",
    "rejectedBadge": "Ditolak: {reason}",
    "noReason": "tidak diberikan"
  },
  "validation": {
    "updateTitleRequired": "Isi minimal satu judul.",
    "updateBodyRequired": "Isi minimal satu isi."
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 3: The server action**

Append to `src/app/[locale]/products/[slug]/actions.ts`:

```ts
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locale-path";
import { parseUpdateForm } from "@/lib/validation";
import { createUpdate } from "@/db/queries/updates";

export type UpdateState = { ok: boolean; errors: Record<string, string> };

export async function postUpdateAction(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const session = await auth();
  const slug = String(formData.get("slug") ?? "");
  if (!session?.user) {
    const locale = await getLocale();
    await signIn("google", {
      redirectTo: localePath(locale, `/products/${slug}/updates/new`),
    });
    return { ok: false, errors: {} }; // unreachable — signIn redirects
  }

  const parsed = parseUpdateForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const productId = String(formData.get("productId") ?? "");
  const created = await createUpdate(
    { productId, authorId: session.user.id, ...parsed.data },
    isAdmin(session),
  );
  if (!created) return { ok: false, errors: { form: "validation.formError" } };

  revalidatePath("/", "layout");
  const locale = await getLocale();
  redirect(localePath(locale, `/products/${slug}?update=1`));
}
```

(Extend the file's existing imports — `auth`, `signIn`, `getLocale`, `isAdmin`, `revalidatePath` are partly there already; add what's missing.)

- [ ] **Step 4: UpdateForm client component**

`src/components/UpdateForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  postUpdateAction,
  type UpdateState,
} from "@/app/[locale]/products/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: UpdateState = { ok: false, errors: {} };

function FieldError({ k }: { k?: string }) {
  const t = useTranslations();
  if (!k) return null;
  return <p className="text-sm text-destructive">{t(k)}</p>;
}

export function UpdateForm({
  productId,
  slug,
}: {
  productId: string;
  slug: string;
}) {
  const t = useTranslations("updates");
  const [state, formAction, pending] = useActionState(
    postUpdateAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="upd-version">{t("version")}</Label>
        <Input id="upd-version" name="version" placeholder="v1.2.0" />
        <FieldError k={state.errors.version} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="upd-title-id">{t("titleId")}</Label>
          <Input id="upd-title-id" name="titleId" />
          <FieldError k={state.errors.titleId} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="upd-title-en">{t("titleEn")}</Label>
          <Input id="upd-title-en" name="titleEn" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="upd-body-id">{t("bodyId")}</Label>
        <Textarea id="upd-body-id" name="bodyId" rows={5} />
        <FieldError k={state.errors.bodyId} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="upd-body-en">{t("bodyEn")}</Label>
        <Textarea id="upd-body-en" name="bodyEn" rows={5} />
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("pairHint")}</p>

      <FieldError k={state.errors.form} />

      <Button type="submit" disabled={pending} className="cursor-pointer">
        {pending && (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        )}
        {t("send")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: The new-update page**

`src/app/[locale]/products/[slug]/updates/new/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { getProductBySlug } from "@/db/queries/products";
import { UpdateForm } from "@/components/UpdateForm";
import { FadeUp } from "@/components/motion-primitives";

export default async function NewUpdatePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail || detail.product.status !== "approved") notFound();

  const session = await auth();
  const canPost =
    session?.user &&
    (session.user.id === detail.product.makerId || isAdmin(session));
  if (!canPost) notFound();

  const t = await getTranslations("updates");

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {t("formTitle")}
        </h1>
        <p className="mt-1 text-muted-foreground">{detail.product.name}</p>
        <UpdateForm productId={detail.product.id} slug={slug} />
      </FadeUp>
    </div>
  );
}
```

- [ ] **Step 6: ProductUpdates section + detail-page wiring**

`src/components/ProductUpdates.tsx`:

```tsx
import { getFormatter, getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import type { UpdateItem } from "@/db/queries/updates";
import { pickLocalizedPair } from "@/lib/locale-content";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export async function ProductUpdates({
  updates,
  locale,
}: {
  updates: UpdateItem[];
  locale: string;
}) {
  const t = await getTranslations("updates");
  const format = await getFormatter();
  if (updates.length === 0) return null;

  return (
    <section className="mt-12">
      <Separator />
      <h2 className="mt-8 font-heading text-xl font-bold">{t("title")}</h2>
      <div className="mt-6 flex flex-col gap-8">
        {updates.map((u) => (
          <article key={u.id}>
            <div className="flex flex-wrap items-center gap-2">
              {u.version && <Badge variant="secondary">{u.version}</Badge>}
              <h3 className="font-heading text-lg font-bold">
                {pickLocalizedPair(u.titleId, u.titleEn, locale)}
              </h3>
              {u.status === "pending" && (
                <Badge className="border-chart-2/40 bg-accent text-accent-foreground">
                  {t("pendingBadge")}
                </Badge>
              )}
              {u.status === "rejected" && (
                <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                  {t("rejectedBadge", {
                    reason: u.rejectionReason ?? t("noReason"),
                  })}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground/80">
                {format.dateTime(u.publishedAt ?? u.createdAt, {
                  dateStyle: "medium",
                })}
              </span>
            </div>
            <div className="prose mt-2 max-w-none dark:prose-invert">
              <ReactMarkdown
                components={{
                  img: () => null,
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      rel="nofollow ugc noopener noreferrer"
                      target="_blank"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {pickLocalizedPair(u.bodyId, u.bodyEn, locale) ?? ""}
              </ReactMarkdown>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

In `src/app/[locale]/products/[slug]/page.tsx`:
- fetch updates beside comments: `const updates = product.status === "approved" ? await listUpdatesForProduct(product.id, viewerIsMaker || viewerIsAdmin) : [];` (import from `@/db/queries/updates`).
- render `<ProductUpdates updates={updates} locale={locale} />` between the images and the CommentSection.
- next to the VoteButton area, when `viewerIsMaker || viewerIsAdmin` and approved, render a "Post update" button:

```tsx
<Button
  variant="outline"
  size="sm"
  nativeButton={false}
  className="cursor-pointer"
  render={<Link href={`/products/${product.slug}/updates/new`} />}
>
  <Megaphone className="size-4" aria-hidden="true" />
  {tUpdates("post")}
</Button>
```

(place it in the categories/actions row; `const tUpdates = await getTranslations("updates");` and import `Megaphone` from lucide-react.)

- [ ] **Step 7: Gates + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds with `/[locale]/products/[slug]/updates/new` in the route list.

```bash
git add -A
git commit -m "feat: add product updates with maker form and changelog section"
```

---

### Task 5: Watches query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/watches.ts`
- Test: `src/db/queries/watches.test.ts`

**Interfaces:**
- Consumes: `DBClient`/`db`, `productWatches`/`products` tables, harness, products fixtures.
- Produces:
  - `toggleWatch(productId: string, userId: string, dbc?): Promise<{ watching: boolean } | null>` — null unless product approved; delete path uses `.returning()` (no counts to drift, but stay consistent).
  - `isWatching(productId: string, userId: string, dbc?): Promise<boolean>`
  - `unsubscribeByToken(token: string, dbc?): Promise<boolean>` — deletes the watch, `.returning()`-guarded.

- [ ] **Step 1: Write failing tests**

`src/db/queries/watches.test.ts`:

```ts
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
```

Run → FAIL (module not found).

- [ ] **Step 2: Implement `src/db/queries/watches.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, productWatches } from "@/db/schema";

export async function toggleWatch(
  productId: string,
  userId: string,
  dbc: DBClient = db,
): Promise<{ watching: boolean } | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;

    const inserted = await tx
      .insert(productWatches)
      .values({ productId, userId })
      .onConflictDoNothing()
      .returning({ id: productWatches.id });
    if (inserted.length > 0) return { watching: true };

    await tx
      .delete(productWatches)
      .where(
        and(
          eq(productWatches.productId, productId),
          eq(productWatches.userId, userId),
        ),
      )
      .returning({ id: productWatches.id });
    return { watching: false };
  });
}

export async function isWatching(
  productId: string,
  userId: string,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .select({ id: productWatches.id })
    .from(productWatches)
    .where(
      and(
        eq(productWatches.productId, productId),
        eq(productWatches.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function unsubscribeByToken(
  token: string,
  dbc: DBClient = db,
): Promise<boolean> {
  const rows = await dbc
    .delete(productWatches)
    .where(eq(productWatches.unsubscribeToken, token))
    .returning({ id: productWatches.id });
  return rows.length > 0;
}
```

- [ ] **Step 3: Run → PASS (4); full suite; commit**

```bash
git add -A
git commit -m "feat: add product watches query layer"
```

---

### Task 6: Email lib + WatchButton + fan-out + unsubscribe

**Files:**
- Create: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`
- Create: `src/components/WatchButton.tsx`
- Create: `src/app/actions/watch.ts`
- Create: `src/app/[locale]/unwatch/[token]/page.tsx`
- Modify: `src/app/[locale]/products/[slug]/page.tsx` (WatchButton beside vote)
- Modify: `src/app/[locale]/admin/actions.ts` (approve/reject update actions + fan-out)
- Modify: `.env.example`, `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `ApprovedUpdatePayload`/`approveUpdate`/`rejectUpdate` (T3), `toggleWatch`/`isWatching`/`unsubscribeByToken` (T5), `assertAdmin`, `after` from `next/server`.
- Produces:
  - `type EmailMessage = { to: string; subject: string; html: string }`
  - `sendEmails(messages: EmailMessage[]): Promise<void>` — no key → log + return; Resend batch POSTs in chunks of 100; failures logged, never thrown.
  - `updateApprovedEmail(opts: { productName: string; productSlug: string; version: string | null; title: string; body: string; unsubscribeToken: string }): EmailMessage-without-to` → `{ subject: string; html: string }` — HTML-escaped content (no markdown rendering in email; "read on Produknesia" link carries the formatting duty), absolute URLs from `APP_URL`.
  - Server actions: `approveUpdateAction(formData)`, `rejectUpdateAction(formData)` (admin), `watchAction(productId: string, currentPath: string): Promise<{ watching: boolean } | null>`.

- [ ] **Step 1: TDD the email lib**

`src/lib/email.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmails, updateApprovedEmail } from "./email";

describe("sendEmails", () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("no-ops without RESEND_API_KEY", async () => {
    await sendEmails([{ to: "a@b.c", subject: "s", html: "<p>x</p>" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches in chunks of 100", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: `u${i}@test.local`,
      subject: "s",
      html: "<p>x</p>",
    }));
    await sendEmails(messages);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBody).toHaveLength(100);
    expect(firstBody[0].to).toEqual(["u0@test.local"]);
  });

  it("swallows network errors", async () => {
    process.env.RESEND_API_KEY = "re_test";
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    await expect(
      sendEmails([{ to: "a@b.c", subject: "s", html: "x" }]),
    ).resolves.toBeUndefined();
  });
});

describe("updateApprovedEmail", () => {
  it("escapes content and includes product + unsubscribe links", () => {
    const { subject, html } = updateApprovedEmail({
      productName: "Kopi <script>",
      productSlug: "kopi",
      version: "v2",
      title: "Big & bold",
      body: "Hello <b>world</b>",
      unsubscribeToken: "tok123",
    });
    expect(subject).toContain("Kopi <script>"); // subjects are plain text
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Big &amp; bold");
    expect(html).toContain("/products/kopi");
    expect(html).toContain("/unwatch/tok123");
  });
});
```

Run → FAIL. Implement `src/lib/email.ts`:

```ts
export type EmailMessage = { to: string; subject: string; html: string };

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Fire-and-log: email must never break the calling action. */
export async function sendEmails(messages: EmailMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Produknesia <onboarding@resend.dev>";
  if (!key) {
    console.warn(`[email] RESEND_API_KEY missing — skipped ${messages.length} email(s)`);
    return;
  }
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((m) => ({
      from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error("[email] batch failed:", res.status, await res.text());
      }
    } catch (error) {
      console.error("[email] batch error:", error);
    }
  }
}

export function updateApprovedEmail(opts: {
  productName: string;
  productSlug: string;
  version: string | null;
  title: string;
  body: string;
  unsubscribeToken: string;
}): { subject: string; html: string } {
  const productUrl = appUrl(`/products/${opts.productSlug}`);
  const unsubscribeUrl = appUrl(`/unwatch/${opts.unsubscribeToken}`);
  const versionBadge = opts.version ? ` (${escapeHtml(opts.version)})` : "";
  // Plain-text body, escaped + paragraphized — full formatting lives on the site.
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return {
    subject: `${opts.productName} — ${opts.title}`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222">
  <h2 style="margin:24px 0 4px">${escapeHtml(opts.productName)}${versionBadge}</h2>
  <h3 style="margin:0 0 16px">${escapeHtml(opts.title)}</h3>
  ${paragraphs}
  <p style="margin:20px 0">
    <a href="${productUrl}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Produknesia →</a>
  </p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#777">
    <a href="${unsubscribeUrl}" style="color:#777">Unsubscribe / Berhenti berlangganan</a>
  </p>
</div>`.trim(),
  };
}
```

Run → PASS (4).

- [ ] **Step 2: env example**

Append to `.env.example`:

```
RESEND_API_KEY=""
EMAIL_FROM="Produknesia <onboarding@resend.dev>"
APP_URL="http://localhost:3000"
```

- [ ] **Step 3: i18n (both catalogs)**

`messages/en.json`:

```json
{
  "watch": { "label": "Watch", "watching": "Watching" },
  "unwatch": {
    "done": "You will no longer receive updates for this product.",
    "invalid": "This unsubscribe link is invalid or already used."
  },
  "adminUpdates": {
    "title": "Pending updates",
    "empty": "No pending updates."
  }
}
```

`messages/id.json`:

```json
{
  "watch": { "label": "Pantau", "watching": "Dipantau" },
  "unwatch": {
    "done": "Kamu tidak akan menerima pembaruan produk ini lagi.",
    "invalid": "Tautan berhenti berlangganan ini tidak valid atau sudah dipakai."
  },
  "adminUpdates": {
    "title": "Pembaruan menunggu",
    "empty": "Tidak ada pembaruan menunggu."
  }
}
```

Parity test → PASS.

- [ ] **Step 4: watchAction + WatchButton + detail wiring**

`src/app/actions/watch.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { localePath } from "@/i18n/locale-path";
import { toggleWatch } from "@/db/queries/watches";

export async function watchAction(
  productId: string,
  currentPath: string,
): Promise<{ watching: boolean } | null> {
  const session = await auth();
  if (!session?.user) {
    const locale = await getLocale();
    await signIn("google", { redirectTo: localePath(locale, currentPath) });
    return null; // unreachable — signIn redirects
  }
  const result = await toggleWatch(productId, session.user.id);
  revalidatePath("/", "layout");
  return result;
}
```

`src/components/WatchButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Bell, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { watchAction } from "@/app/actions/watch";
import { Button } from "@/components/ui/button";

export function WatchButton({
  productId,
  initialWatching,
}: {
  productId: string;
  initialWatching: boolean;
}) {
  const t = useTranslations("watch");
  const pathname = usePathname();
  const [watching, setWatching] = useState(initialWatching);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    const prev = watching;
    setWatching(!prev);
    startTransition(async () => {
      const result = await watchAction(productId, pathname);
      setWatching(result ? result.watching : prev);
    });
  }

  return (
    <Button
      variant={watching ? "secondary" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={watching}
      className="cursor-pointer"
    >
      {watching ? (
        <BellRing className="size-4" aria-hidden="true" />
      ) : (
        <Bell className="size-4" aria-hidden="true" />
      )}
      {watching ? t("watching") : t("label")}
    </Button>
  );
}
```

Detail page: fetch `const watching = session?.user ? await isWatching(product.id, session.user.id) : false;` (import from `@/db/queries/watches`) and render `<WatchButton productId={product.id} initialWatching={watching} />` beside the "Visit website" button in the categories/actions row (approved products only — it's already inside that gate).

- [ ] **Step 5: Admin update queue actions with fan-out**

Append to `src/app/[locale]/admin/actions.ts`:

```ts
import { after } from "next/server";
import { approveUpdate, rejectUpdate } from "@/db/queries/updates";
import { sendEmails, updateApprovedEmail } from "@/lib/email";

export async function approveUpdateAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const payload = await approveUpdate(id);
  if (payload) {
    // Fan-out after the response — never blocks or breaks the approval.
    after(async () => {
      const title = payload.update.titleId ?? payload.update.titleEn ?? "";
      const body = payload.update.bodyId ?? payload.update.bodyEn ?? "";
      await sendEmails(
        payload.watchers.map((w) => ({
          to: w.email,
          ...updateApprovedEmail({
            productName: payload.productName,
            productSlug: payload.productSlug,
            version: payload.update.version,
            title,
            body,
            unsubscribeToken: w.unsubscribeToken,
          }),
        })),
      );
    });
  }
  revalidatePath("/", "layout");
}

export async function rejectUpdateAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (id) await rejectUpdate(id, reason);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 6: Unsubscribe page**

`src/app/[locale]/unwatch/[token]/page.tsx`:

```tsx
import { BellOff, CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { unsubscribeByToken } from "@/db/queries/watches";

export default async function UnwatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const removed = await unsubscribeByToken(token);
  const t = await getTranslations("unwatch");

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        {removed ? (
          <BellOff className="size-8 text-muted-foreground" aria-hidden="true" />
        ) : (
          <CircleAlert className="size-8 text-muted-foreground" aria-hidden="true" />
        )}
        <p className="text-base text-muted-foreground">
          {removed ? t("done") : t("invalid")}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Gates + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds (`/[locale]/unwatch/[token]` in routes).

```bash
git add -A
git commit -m "feat: add watch button, Resend email fan-out, unsubscribe"
```

---

### Task 7: Admin pending-updates queue UI

**Files:**
- Modify: `src/app/[locale]/admin/page.tsx`

**Interfaces:**
- Consumes: `listPendingUpdates`/`PendingUpdateItem` (T3), `approveUpdateAction`/`rejectUpdateAction` (T6), i18n `adminUpdates.*` + reuse `admin.approve`/`admin.reject`/`admin.reasonPlaceholder`/`admin.view`.

- [ ] **Step 1: Extend the admin page**

In `src/app/[locale]/admin/page.tsx`, fetch both queues in parallel:

```tsx
const [pending, pendingUpdates] = await Promise.all([
  listPending(),
  listPendingUpdates(),
]);
```

(import `listPendingUpdates` from `@/db/queries/updates`, `approveUpdateAction`/`rejectUpdateAction` from `./actions`, `pickLocalizedPair` from `@/lib/locale-content`.)

Below the existing products list, add:

```tsx
<h2 className="mt-12 font-heading text-xl font-bold">
  {tUpdates("title")}
</h2>

{pendingUpdates.length === 0 && (
  <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-base text-muted-foreground">
    {tUpdates("empty")}
  </p>
)}

<div className="mt-4 flex flex-col gap-4">
  {pendingUpdates.map((u) => (
    <Card key={u.id} className="py-0 shadow-xs">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading font-bold">{u.productName}</span>
          {u.version && <Badge variant="secondary">{u.version}</Badge>}
          <span className="text-sm text-muted-foreground">
            {pickLocalizedPair(u.titleId, u.titleEn, locale)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto cursor-pointer"
            nativeButton={false}
            render={<Link href={`/products/${u.productSlug}`} />}
          >
            {t("view")}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {(u.bodyId ?? u.bodyEn ?? "").slice(0, 400)}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
          <form action={approveUpdateAction}>
            <input type="hidden" name="id" value={u.id} />
            <Button
              type="submit"
              size="sm"
              className="w-full cursor-pointer bg-chart-3 text-white hover:bg-chart-3/85 sm:w-auto"
            >
              <Check className="size-4" aria-hidden="true" />
              {t("approve")}
            </Button>
          </form>
          <form action={rejectUpdateAction} className="flex flex-1 gap-2">
            <input type="hidden" name="id" value={u.id} />
            <Input
              name="reason"
              placeholder={t("reasonPlaceholder")}
              aria-label={t("reasonPlaceholder")}
              className="h-9 flex-1 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              className="cursor-pointer"
            >
              <X className="size-4" aria-hidden="true" />
              {t("reject")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

(`const tUpdates = await getTranslations("adminUpdates");`; `locale` is already awaited from params; extend imports: `Badge`.)

- [ ] **Step 2: Gates + commit**

Run: `pnpm test` all pass; `npx tsc --noEmit` clean; `pnpm build` succeeds.

```bash
git add -A
git commit -m "feat: add pending-updates queue to admin"
```

---

### Task 8: Invites query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/invites.ts`
- Test: `src/db/queries/invites.test.ts`

**Interfaces:**
- Consumes: `invites`/`products`/`productImages`/`productCategories` tables, `InviteDraft` (T2), `slugify`/`ensureUniqueSlug`, `slugExists` from products.ts.
- Produces:
  - `type InviteRow = typeof invites.$inferSelect` (with `draft` cast to `InviteDraft` by callers via `inviteDraftSchema.parse`).
  - `createInvite(args: { draft: InviteDraft; note?: string; createdBy: string; expiresInDays?: number }, dbc?): Promise<{ id: string; token: string }>` (default 14 days).
  - `getOpenInviteByToken(token: string, dbc?): Promise<InviteRow | null>` — null when missing, expired, or claimed.
  - `listInvites(dbc?): Promise<(InviteRow & { claimedByName: string | null })[]>` — newest first.
  - `claimInvite(args: { token: string; userId: string; data: InviteDraft }, dbc?): Promise<{ productId: string; slug: string } | null>` — one transaction: re-check open + `claimedBy IS NULL` guard on the invite update (`.returning()`), create the product **approved** with `launchedAt = now()`, insert images/categories, mark the invite. Null on any guard failure (zero partial writes).

- [ ] **Step 1: Write failing tests**

`src/db/queries/invites.test.ts`:

```ts
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
```

Run → FAIL (module not found).

- [ ] **Step 2: Implement `src/db/queries/invites.ts`**

```ts
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import {
  invites,
  productCategories,
  productImages,
  products,
  users,
} from "@/db/schema";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import type { InviteDraft } from "@/lib/validation";
import { slugExists } from "./products";

export type InviteRow = typeof invites.$inferSelect;

export async function createInvite(
  args: {
    draft: InviteDraft;
    note?: string;
    createdBy: string;
    expiresInDays?: number;
  },
  dbc: DBClient = db,
): Promise<{ id: string; token: string }> {
  const days = args.expiresInDays ?? 14;
  const [row] = await dbc
    .insert(invites)
    .values({
      draft: args.draft,
      note: args.note ?? null,
      createdBy: args.createdBy,
      expiresAt: sql`now() + make_interval(days => ${days})`,
    })
    .returning({ id: invites.id, token: invites.token });
  return row;
}

export async function getOpenInviteByToken(
  token: string,
  dbc: DBClient = db,
): Promise<InviteRow | null> {
  const rows = await dbc
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.token, token),
        isNull(invites.claimedBy),
        gt(invites.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listInvites(
  dbc: DBClient = db,
): Promise<(InviteRow & { claimedByName: string | null })[]> {
  const rows = await dbc
    .select({ invite: invites, claimedByName: users.name })
    .from(invites)
    .leftJoin(users, eq(invites.claimedBy, users.id))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => ({ ...r.invite, claimedByName: r.claimedByName }));
}

export async function claimInvite(
  args: { token: string; userId: string; data: InviteDraft },
  dbc: DBClient = db,
): Promise<{ productId: string; slug: string } | null> {
  const base = slugify(args.data.name) || "produk";
  const slug = await ensureUniqueSlug(base, (s) => slugExists(s, dbc));

  return dbc.transaction(async (tx) => {
    // Claim guard: only an open, unexpired, unclaimed invite transitions.
    const claimed = await tx
      .update(invites)
      .set({
        claimedBy: args.userId,
        claimedAt: sql`now()`,
      })
      .where(
        and(
          eq(invites.token, args.token),
          isNull(invites.claimedBy),
          gt(invites.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: invites.id });
    if (claimed.length === 0) return null;

    const [product] = await tx
      .insert(products)
      .values({
        slug,
        name: args.data.name,
        taglineId: args.data.taglineId ?? null,
        taglineEn: args.data.taglineEn ?? null,
        descriptionId: args.data.descriptionId ?? null,
        descriptionEn: args.data.descriptionEn ?? null,
        websiteUrl: args.data.websiteUrl,
        logoUrl: args.data.logoUrl ?? null,
        makerId: args.userId,
        status: "approved",
        launchedAt: sql`now()`,
      })
      .returning({ id: products.id, slug: products.slug });

    if (args.data.screenshotUrls.length > 0) {
      await tx.insert(productImages).values(
        args.data.screenshotUrls.map((url, i) => ({
          productId: product.id,
          url,
          sortOrder: i,
        })),
      );
    }
    await tx.insert(productCategories).values(
      args.data.categoryIds.map((categoryId) => ({
        productId: product.id,
        categoryId,
      })),
    );
    await tx
      .update(invites)
      .set({ claimedProductId: product.id })
      .where(eq(invites.id, claimed[0].id));

    return { productId: product.id, slug: product.slug };
  });
}
```

- [ ] **Step 3: Run → PASS (7); full suite; commit**

```bash
git add -A
git commit -m "feat: add invites query layer"
```

---

### Task 9: Admin invites UI + claim flow

**Files:**
- Modify: `src/components/SubmitForm.tsx` (add `action`, `defaults`, `submitLabel`, `noteField` props — default behavior unchanged)
- Create: `src/app/[locale]/admin/invites/page.tsx`
- Create: `src/app/[locale]/admin/invites/actions.ts`
- Create: `src/components/CopyButton.tsx`
- Create: `src/app/[locale]/claim/[token]/page.tsx`
- Create: `src/app/[locale]/claim/[token]/actions.ts`
- Modify: `messages/en.json`, `messages/id.json`
- Test: `src/components/SubmitForm.test.tsx` (new — defaults rendering)

**Interfaces:**
- Consumes: T8 queries, `inviteDraftSchema`/`parseProductForm`/`InviteDraft` (T2), `putImage`/`validateImage`, `assertAdmin`, `localePath`, `SubmitState` (existing).
- Produces:
  - `SubmitForm` new props: `{ action?: (prev: SubmitState, fd: FormData) => Promise<SubmitState>; defaults?: SubmitDefaults; submitLabel?: string; noteField?: boolean }` with `export type SubmitDefaults = { name?: string; taglineId?: string; taglineEn?: string; descriptionId?: string; descriptionEn?: string; websiteUrl?: string; categoryIds?: string[]; note?: string }`.
  - `createInviteAction(prev: SubmitState, fd: FormData): Promise<SubmitState>` (admin) — parses like submit, uploads images, validates `inviteDraftSchema`, `createInvite`, redirects to `/admin/invites?created=<token>`.
  - `claimAction(prev: SubmitState, fd: FormData): Promise<SubmitState>` — session check (guest → signIn back to claim page), token from hidden field, re-validate, uploads replace draft images if provided, `claimInvite`, redirect to the product page.

- [ ] **Step 1: TDD SubmitForm defaults**

`src/components/SubmitForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SubmitForm } from "./SubmitForm";

vi.mock("@/app/[locale]/submit/actions", () => ({
  submitProduct: vi.fn(),
}));

const messages = {
  submit: {
    title: "t", signInFirst: "s", name: "Product name",
    taglineId: "Tagline (Indonesian)", taglineEn: "Tagline (English)",
    taglineHint: "hint", descriptionId: "d1", descriptionEn: "d2",
    website: "Website URL", categories: "Categories (up to 3)",
    logo: "Logo", screenshots: "Screenshots (up to 4)",
    send: "Submit for review", success: "ok",
  },
};

describe("SubmitForm defaults", () => {
  it("prefills fields and checks default categories", () => {
    render(
      <NextIntlClientProvider locale="id" messages={messages}>
        <SubmitForm
          categories={[
            { id: "c1", label: "AI" },
            { id: "c2", label: "SaaS" },
          ]}
          defaults={{
            name: "Kopi Kirim",
            websiteUrl: "https://kopikirim.id",
            categoryIds: ["c1"],
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Product name")).toHaveValue("Kopi Kirim");
    expect(screen.getByLabelText("Website URL")).toHaveValue(
      "https://kopikirim.id",
    );
    expect(screen.getByRole("checkbox", { name: "AI" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "SaaS" })).not.toBeChecked();
  });
});
```

Run → FAIL (no defaults prop).

- [ ] **Step 2: Extend SubmitForm (backward compatible)**

In `src/components/SubmitForm.tsx`:

```tsx
export type SubmitDefaults = {
  name?: string;
  taglineId?: string;
  taglineEn?: string;
  descriptionId?: string;
  descriptionEn?: string;
  websiteUrl?: string;
  categoryIds?: string[];
  note?: string;
};

export function SubmitForm({
  categories,
  action = submitProduct,
  defaults,
  submitLabel,
  noteField = false,
}: {
  categories: { id: string; label: string }[];
  action?: (prev: SubmitState, fd: FormData) => Promise<SubmitState>;
  defaults?: SubmitDefaults;
  submitLabel?: string;
  noteField?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  // ...
}
```

Changes inside the JSX (everything else stays as-is):
- each text field gains `defaultValue={defaults?.name}` (matching key);
- each category checkbox gains `defaultChecked={defaults?.categoryIds?.includes(c.id)}`;
- before the logo field, when `noteField` is true render:

```tsx
{noteField && (
  <div className="flex flex-col gap-2">
    <Label htmlFor="submit-note">{tInvites("note")}</Label>
    <Input id="submit-note" name="note" defaultValue={defaults?.note} />
  </div>
)}
```

with `const tInvites = useTranslations("invites");`
- the submit button label becomes `{submitLabel ?? t("send")}`.

Run the new test → PASS. Run the full suite → all pass (existing submit flow untouched: default props preserve behavior).

- [ ] **Step 3: i18n (both catalogs)**

`messages/en.json`:

```json
{
  "invites": {
    "title": "Invites",
    "new": "New invite",
    "note": "Who is this for? (private note)",
    "create": "Create invite link",
    "created": "Invite created — copy the link below.",
    "copy": "Copy link",
    "copied": "Copied!",
    "open": "Open",
    "claimed": "Claimed by {name}",
    "expired": "Expired",
    "claimTitle": "You're invited to launch on Produknesia",
    "claimIntro": "We prepared this listing for you. Sign in, adjust anything you like, and publish it as yours.",
    "claimCta": "Claim & publish",
    "claimSignIn": "Sign in with Google to claim",
    "deadEnd": "This invite link is invalid, expired, or already claimed."
  }
}
```

`messages/id.json`:

```json
{
  "invites": {
    "title": "Undangan",
    "new": "Undangan baru",
    "note": "Untuk siapa? (catatan pribadi)",
    "create": "Buat tautan undangan",
    "created": "Undangan dibuat — salin tautan di bawah.",
    "copy": "Salin tautan",
    "copied": "Tersalin!",
    "open": "Terbuka",
    "claimed": "Diklaim oleh {name}",
    "expired": "Kedaluwarsa",
    "claimTitle": "Kamu diundang meluncurkan produk di Produknesia",
    "claimIntro": "Kami sudah menyiapkan listing ini untukmu. Masuk, sesuaikan seperlunya, lalu terbitkan sebagai milikmu.",
    "claimCta": "Klaim & terbitkan",
    "claimSignIn": "Masuk dengan Google untuk mengklaim",
    "deadEnd": "Tautan undangan ini tidak valid, kedaluwarsa, atau sudah diklaim."
  }
}
```

Parity test → PASS.

- [ ] **Step 4: Admin invites actions + page + CopyButton**

`src/app/[locale]/admin/invites/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { assertAdmin } from "@/auth-helpers";
import { localePath } from "@/i18n/locale-path";
import { parseProductForm, inviteDraftSchema } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { createInvite } from "@/db/queries/invites";
import type { SubmitState } from "@/app/[locale]/submit/actions";

function pickFiles(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function createInviteAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await auth();
  assertAdmin(session);

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1) return { errors: { logo: "validation.logoSingle" } };
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" } };
  }
  const toValidate = [
    ...logoFiles.map((file) => ({ field: "logo" as const, file })),
    ...screenshotFiles.map((file) => ({ field: "screenshots" as const, file })),
  ];
  for (const { field, file } of toValidate) {
    const err = validateImage(file);
    if (err) return { errors: { [field]: err } };
  }

  let token: string;
  try {
    const logoUrl = logoFiles[0] ? await putImage(logoFiles[0]) : undefined;
    const screenshotUrls: string[] = [];
    for (const f of screenshotFiles) screenshotUrls.push(await putImage(f));

    const draft = inviteDraftSchema.parse({
      ...parsed.data,
      logoUrl,
      screenshotUrls,
    });
    const note = String(formData.get("note") ?? "").trim() || undefined;
    const invite = await createInvite({
      draft,
      note,
      createdBy: session.user.id,
    });
    token = invite.token;
  } catch {
    return { errors: { form: "validation.formError" } };
  }

  revalidatePath("/", "layout");
  const locale = await getLocale();
  redirect(localePath(locale, `/admin/invites?created=${token}`));
}
```

`src/components/CopyButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function CopyButton({ value }: { value: string }) {
  const t = useTranslations("invites");
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}
```

`src/app/[locale]/admin/invites/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { localePath } from "@/i18n/locale-path";
import { listInvites } from "@/db/queries/invites";
import { listCategories } from "@/db/queries/categories";
import { SubmitForm } from "@/components/SubmitForm";
import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createInviteAction } from "./actions";

function claimUrl(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/claim/${token}`;
}

export default async function AdminInvitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { locale } = await params;
  const { created } = await searchParams;
  const session = await auth();
  if (!isAdmin(session)) redirect(localePath(locale, "/"));

  const t = await getTranslations("invites");
  const format = await getFormatter();
  const [invitesList, cats] = await Promise.all([
    listInvites(),
    listCategories(),
  ]);
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">
        {t("title")}
      </h1>

      {created && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-chart-3/40 bg-chart-3/10 p-5">
          <p className="text-sm">{t("created")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-card px-3 py-2 text-sm">
              {claimUrl(created)}
            </code>
            <CopyButton value={claimUrl(created)} />
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {invitesList.map((inv) => {
          const expired = inv.expiresAt < new Date();
          return (
            <Card key={inv.id} className="py-0 shadow-xs">
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
                <span className="font-medium">
                  {(inv.draft as { name?: string }).name ?? "—"}
                </span>
                {inv.note && (
                  <span className="text-sm text-muted-foreground">
                    {inv.note}
                  </span>
                )}
                <span className="text-sm text-muted-foreground/80">
                  {format.dateTime(inv.createdAt, { dateStyle: "medium" })}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {inv.claimedBy ? (
                    <Badge variant="secondary">
                      {t("claimed", { name: inv.claimedByName ?? "?" })}
                    </Badge>
                  ) : expired ? (
                    <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                      {t("expired")}
                    </Badge>
                  ) : (
                    <>
                      <Badge className="border-chart-3/40 bg-chart-3/10 text-foreground">
                        {t("open")}
                      </Badge>
                      <CopyButton value={claimUrl(inv.token)} />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 font-heading text-xl font-bold">{t("new")}</h2>
      <SubmitForm
        categories={catOptions}
        action={createInviteAction}
        submitLabel={t("create")}
        noteField
      />
    </div>
  );
}
```

Also add a link to `/admin/invites` from the admin page header row:

```tsx
<Button
  variant="outline"
  size="sm"
  nativeButton={false}
  className="ml-auto cursor-pointer"
  render={<Link href="/admin/invites" />}
>
  {tInvites("title")}
</Button>
```

(wrap the admin `<h1>` in a `flex items-center` row; `const tInvites = await getTranslations("invites");`)

- [ ] **Step 5: Claim action + page**

`src/app/[locale]/claim/[token]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { localePath } from "@/i18n/locale-path";
import { parseProductForm, inviteDraftSchema } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { claimInvite, getOpenInviteByToken } from "@/db/queries/invites";
import type { SubmitState } from "@/app/[locale]/submit/actions";

function pickFiles(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function claimAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const token = String(formData.get("inviteToken") ?? "");
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) {
    await signIn("google", {
      redirectTo: localePath(locale, `/claim/${token}`),
    });
    return { errors: {} }; // unreachable — signIn redirects
  }

  const invite = await getOpenInviteByToken(token);
  if (!invite) return { errors: { form: "validation.formError" } };
  const draft = inviteDraftSchema.parse(invite.draft);

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1) return { errors: { logo: "validation.logoSingle" } };
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" } };
  }
  const toValidate = [
    ...logoFiles.map((file) => ({ field: "logo" as const, file })),
    ...screenshotFiles.map((file) => ({ field: "screenshots" as const, file })),
  ];
  for (const { field, file } of toValidate) {
    const err = validateImage(file);
    if (err) return { errors: { [field]: err } };
  }

  let slug: string;
  try {
    // New uploads replace the admin's images; otherwise keep the draft's.
    const logoUrl = logoFiles[0] ? await putImage(logoFiles[0]) : draft.logoUrl;
    const screenshotUrls =
      screenshotFiles.length > 0
        ? await Promise.all(screenshotFiles.map((f) => putImage(f)))
        : draft.screenshotUrls;

    const data = inviteDraftSchema.parse({
      ...parsed.data,
      logoUrl,
      screenshotUrls,
    });
    const result = await claimInvite({ token, userId: session.user.id, data });
    if (!result) return { errors: { form: "validation.formError" } };
    slug = result.slug;
  } catch {
    return { errors: { form: "validation.formError" } };
  }

  revalidatePath("/", "layout");
  redirect(localePath(locale, `/products/${slug}`));
}
```

`src/app/[locale]/claim/[token]/page.tsx`:

```tsx
import Image from "next/image";
import { CircleAlert, LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { localePath } from "@/i18n/locale-path";
import { getOpenInviteByToken } from "@/db/queries/invites";
import { listCategories } from "@/db/queries/categories";
import { inviteDraftSchema } from "@/lib/validation";
import { SubmitForm } from "@/components/SubmitForm";
import { FadeUp } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { claimAction } from "./actions";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations("invites");
  const invite = await getOpenInviteByToken(token);

  if (!invite) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <CircleAlert
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-base text-muted-foreground">{t("deadEnd")}</p>
        </div>
      </div>
    );
  }

  const draft = inviteDraftSchema.parse(invite.draft);
  const session = await auth();

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {t("claimTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("claimIntro")}</p>

        <div className="mt-6 flex items-center gap-4 rounded-xl border bg-card p-5">
          {draft.logoUrl && (
            <Image
              src={draft.logoUrl}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-xl border object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold">
              {draft.name}
            </p>
            {(draft.taglineId ?? draft.taglineEn) && (
              <p className="truncate text-base text-muted-foreground">
                {locale === "id"
                  ? (draft.taglineId ?? draft.taglineEn)
                  : (draft.taglineEn ?? draft.taglineId)}
              </p>
            )}
          </div>
        </div>

        {!session?.user ? (
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google", {
                redirectTo: localePath(locale, `/claim/${token}`),
              });
            }}
          >
            <Button type="submit" className="cursor-pointer">
              <LogIn className="size-4" aria-hidden="true" />
              {t("claimSignIn")}
            </Button>
          </form>
        ) : (
          <ClaimForm token={token} locale={locale} draft={draft} />
        )}
      </FadeUp>
    </div>
  );
}

async function ClaimForm({
  token,
  locale,
  draft,
}: {
  token: string;
  locale: string;
  draft: ReturnType<typeof inviteDraftSchema.parse>;
}) {
  const t = await getTranslations("invites");
  const cats = await listCategories();
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));
  return (
    <SubmitForm
      categories={catOptions}
      action={claimAction}
      submitLabel={t("claimCta")}
      defaults={{
        name: draft.name,
        taglineId: draft.taglineId,
        taglineEn: draft.taglineEn,
        descriptionId: draft.descriptionId,
        descriptionEn: draft.descriptionEn,
        websiteUrl: draft.websiteUrl,
        categoryIds: draft.categoryIds,
      }}
      hiddenFields={{ inviteToken: token }}
    />
  );
}
```

`hiddenFields` is one more tiny SubmitForm prop:
`hiddenFields?: Record<string, string>` rendered as

```tsx
{hiddenFields &&
  Object.entries(hiddenFields).map(([k, v]) => (
    <input key={k} type="hidden" name={k} value={v} />
  ))}
```

at the top of the form (add it in Step 2 alongside the other props).

- [ ] **Step 6: Gates + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds (`/[locale]/admin/invites`, `/[locale]/claim/[token]` in routes).

```bash
git add -A
git commit -m "feat: add admin invites and claim flow"
```

---

### Task 10: Final verification

**Files:** none (verification; ledger only).

- [ ] **Step 1: Gates**

Run: `pnpm test` (all pass, pristine), `npx tsc --noEmit` (clean), `pnpm build` (succeeds).

- [ ] **Step 2: Manual E2E smoke (needs OAuth; email part needs RESEND_API_KEY in .env.local)**

With `pnpm dev`:
1. As maker: product page → "Post update" → submit (one language only) → pending badge visible to you, invisible in a private window.
2. Watch the product from a second account (or unwatch/re-watch with one).
3. As admin: `/admin` → pending update appears → Approve → watcher receives the email (check the unsubscribe link works and shows the confirmation page; re-clicking shows "invalid").
4. Reject path: post another update → reject with a reason → maker sees the rejected badge + reason.
5. `/admin/invites` → create an invite with logo + note → copy link → open in a private window → dead-end for a wrong token, preview for the right one → sign in → tweak the name → claim → product page live immediately, listed on the feed, owned by the claimer; invite shows "Claimed by …"; the same link now dead-ends.
6. Both locales for all new screens.

If Resend/OAuth aren't configured, record which parts were smoke-deferred.

- [ ] **Step 3: Deployment notes**

Set `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL=https://produknesia.vercel.app` in Vercel envs before relying on emails in production. Run nothing else — the 0001 migration was applied in Task 1 (same DB).

---

## Self-Review

- **Spec coverage:** three tables (T1) ✓; validation for updates + drafts (T2) ✓; updates queries with approval payload (T3) ✓; maker form + changelog section + hardened markdown + bilingual fallback (T4) ✓; watches queries incl. unsubscribe (T5) ✓; Resend lib (no-op without key, batches, escaped template with unsubscribe link), WatchButton, `after()` fan-out on approval, unwatch page (T6) ✓; admin pending-updates queue (T7) ✓; invites queries with claim transaction + double-claim/expiry guards (T8) ✓; admin invites UI + claim flow with editable prefill and auto-approve (T9) ✓; verification + smoke (T10) ✓. Spec's phasing lists 9 items; this plan splits them into 10 tasks (email+watch UI merged in T6; queue UI separate in T7) — same coverage.
- **Placeholder scan:** none. Two explicit contingency notes (zod `.extend` fallback; smoke-deferral recording) are instructions, not gaps.
- **Type consistency:** `UpdateState`/`SubmitState` shapes; `ApprovedUpdatePayload.watchers: {email, unsubscribeToken}[]` matches T6's fan-out; `InviteDraft` produced in T2, consumed in T8/T9; `SubmitDefaults`/`hiddenFields` defined in T9 Step 2 and used in Step 5; `pickLocalizedPair(idValue, enValue, locale)` consistent across T4/T7; `localePath` used in every action redirect.
