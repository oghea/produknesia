# Phase 2: Core Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core Product Hunt loop: makers submit products (with image uploads), admins approve/reject them, approved products appear in a Popular/Newest feed and on a product detail page.

**Architecture:** All data access lives in query functions under `src/db/queries/` that default to the shared `db` client but accept an injected client, so they are integration-tested against PGlite (in-memory Postgres) running the real migration. Mutations are server actions that compose tested pieces: session check → zod validation → storage upload → query function. Image storage is abstracted in `src/lib/storage.ts` (Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, local `public/uploads/` fallback in dev). UI is server components with small client islands (submit form), styled with Tailwind.

**Tech Stack:** Existing Phase 1 stack + `zod` (validation), `@electric-sql/pglite` (test DB), `@vercel/blob` (storage), `react-markdown` (descriptions), `tsx` (TS scripts).

## Global Constraints

- Package manager: **pnpm**. TypeScript `strict: true`.
- **All new UI uses Tailwind classes — no inline `style={{}}`.** (Phase 1's placeholder inline styles get converted in Task 7.)
- **Every user-facing string lives in BOTH `messages/id.json` and `messages/en.json`** — the parity test (`src/i18n/messages.test.ts`) enforces identical key sets. Validation errors are returned as i18n keys (e.g. `"validation.nameRequired"`) and translated in the UI.
- All mutations are **server actions**. Every action re-checks the session server-side; admin actions call `assertAdmin` from `src/auth-helpers.ts`.
- All DB access goes through query functions in `src/db/queries/*` using the Drizzle **core select/insert/update API** (not the relational `db.query.*` API). Each function's last parameter is `dbc: DBClient = db` for test injection.
- Only `status = 'approved'` products are publicly visible. Makers/admins may view their own pending/rejected products on the detail page.
- Images: `image/jpeg`, `image/png`, `image/webp` only, max 4 MB each, max 4 screenshots + 1 logo.
- Locale-prefixed redirects in server actions: build paths as `` `/${locale}${path}` `` with `getLocale()` from `next-intl/server`.
- Never commit secrets; `.env.local` stays gitignored. `public/uploads/` (dev fallback) is gitignored.

## Prerequisite (before Task 1)

`.env.local` must contain a real Neon `DATABASE_URL`. If it is missing or still a placeholder, STOP and ask the human — Task 1 applies the migration to the live dev database.

---

### Task 1: Apply migration, seed categories, real README

**Files:**
- Create: `src/db/seed-data.ts`
- Create: `src/db/seed.ts`
- Modify: `package.json` (add `db:seed` script, add `tsx` dev dep)
- Modify: `README.md` (replace scaffold boilerplate)
- Test: `src/db/seed-data.test.ts`

**Interfaces:**
- Consumes: `db` from `src/db/index.ts`, `categories` table from `src/db/schema.ts`.
- Produces: `CATEGORIES: readonly {slug: string; nameId: string; nameEn: string}[]` from `src/db/seed-data.ts`; a seeded live DB; `pnpm db:seed` (idempotent).

- [ ] **Step 1: Verify the live DB connection and apply the migration**

Confirm `DATABASE_URL` is set (do NOT print its value):

```bash
node -e "const {config}=require('dotenv');config({path:['.env.local']});const u=process.env.DATABASE_URL||'';console.log(u.startsWith('postgresql')&&!u.includes('user:password')?'DB URL OK':'DB URL MISSING/PLACEHOLDER')"
```
Expected: `DB URL OK`. If not, STOP and ask the human.

```bash
pnpm db:migrate
```
Expected: drizzle-kit applies `drizzle/0000_outgoing_anthem.sql` without error.

- [ ] **Step 2: Write the category seed data with a failing test first**

`src/db/seed-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CATEGORIES } from "./seed-data";

describe("CATEGORIES", () => {
  it("has at least 8 categories with unique slugs", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(slugs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("every category has both locale names", () => {
    for (const c of CATEGORIES) {
      expect(c.nameId.length).toBeGreaterThan(0);
      expect(c.nameEn.length).toBeGreaterThan(0);
    }
  });
});
```

Run: `pnpm test src/db/seed-data.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement the seed data**

`src/db/seed-data.ts`:

```ts
export const CATEGORIES = [
  { slug: "ai", nameId: "AI", nameEn: "AI" },
  { slug: "saas", nameId: "SaaS", nameEn: "SaaS" },
  { slug: "e-commerce", nameId: "E-Commerce", nameEn: "E-Commerce" },
  { slug: "fintech", nameId: "Fintech", nameEn: "Fintech" },
  { slug: "edukasi", nameId: "Edukasi", nameEn: "Education" },
  { slug: "kesehatan", nameId: "Kesehatan", nameEn: "Health" },
  { slug: "produktivitas", nameId: "Produktivitas", nameEn: "Productivity" },
  { slug: "developer-tools", nameId: "Developer Tools", nameEn: "Developer Tools" },
  { slug: "media-sosial", nameId: "Media Sosial", nameEn: "Social Media" },
  { slug: "game", nameId: "Game", nameEn: "Games" },
  { slug: "travel", nameId: "Travel", nameEn: "Travel" },
  { slug: "kuliner", nameId: "Kuliner", nameEn: "Food & Beverage" },
] as const;
```

Run: `pnpm test src/db/seed-data.test.ts` → Expected: PASS.

- [ ] **Step 4: Write the idempotent seed script**

```bash
pnpm add -D tsx
```

`src/db/seed.ts` (dotenv loads BEFORE the db import so the env check passes):

```ts
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

async function main() {
  const { db } = await import("./index");
  const { categories } = await import("./schema");
  const { CATEGORIES } = await import("./seed-data");

  await db
    .insert(categories)
    .values([...CATEGORIES])
    .onConflictDoNothing({ target: categories.slug });

  const rows = await db.select({ slug: categories.slug }).from(categories);
  console.log(`Categories in DB: ${rows.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add to `package.json` scripts: `"db:seed": "tsx src/db/seed.ts"`.

- [ ] **Step 5: Run the seed twice to prove idempotency**

Run: `pnpm db:seed` → Expected: `Categories in DB: 12`.
Run: `pnpm db:seed` again → Expected: still `Categories in DB: 12` (no duplicates, no error).

- [ ] **Step 6: Replace the boilerplate README**

`README.md` — replace entirely with:

```markdown
# Produknesia

An Indonesia-focused Product Hunt: makers launch products, the community
upvotes and discusses them. Bilingual (Bahasa Indonesia / English).

## Stack

Next.js (App Router) · Neon Postgres + Drizzle ORM · Auth.js v5 (Google) ·
next-intl · Vercel Blob · Tailwind CSS · Vitest

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — Neon connection string
   - `AUTH_SECRET` — `npx auth secret`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth client
     (redirect URI: `http://localhost:3000/api/auth/callback/google`;
     add your production domain's equivalent when deploying)
   - `BLOB_READ_WRITE_TOKEN` — optional in dev (falls back to `public/uploads/`)
3. `pnpm db:migrate` — apply migrations
4. `pnpm db:seed` — seed categories (idempotent)
5. `pnpm dev`

## Admin bootstrap

Sign in once, then promote yourself in the Neon SQL console:

    update users set role = 'admin' where email = 'you@example.com';

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test` / `pnpm test:watch`
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed`
```

- [ ] **Step 7: Full suite + commit**

Run: `pnpm test` → Expected: all pass.

```bash
git add -A
git commit -m "feat: apply migration to dev DB, seed categories, real README"
```

---

### Task 2: PGlite test harness

**Files:**
- Create: `src/db/types.ts`
- Create: `src/test/db.ts`
- Test: `src/test/db.test.ts`

**Interfaces:**
- Consumes: `drizzle/` migration folder, `src/db/schema.ts`.
- Produces:
  - `DBClient` type from `src/db/types.ts` — the parameter type every query function uses.
  - `createTestDb(): Promise<TestDb>` from `src/test/db.ts` — fresh in-memory Postgres with the real migration applied.
  - `seedTestUser(db, overrides?): Promise<{id: string}>` — inserts a user row (satisfies maker FKs).

- [ ] **Step 1: Install PGlite**

```bash
pnpm add -D @electric-sql/pglite
```

- [ ] **Step 2: Write the DBClient type**

`src/db/types.ts`:

```ts
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

// Common interface satisfied by the Neon client, PGlite client, and
// transaction objects — lets query functions accept any of them.
export type DBClient = PgDatabase<PgQueryResultHKT, typeof schema>;
```

Note for the implementer: if the Neon or PGlite drizzle instance fails to assign to this type under strict mode, widen the first type parameter (`PgDatabase<any, typeof schema>`) rather than duplicating query functions — and record the deviation in your report.

- [ ] **Step 3: Write a failing harness smoke test**

`src/test/db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createTestDb, seedTestUser } from "./db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("test db harness", () => {
  it("applies the real migration and accepts inserts", async () => {
    const db = await createTestDb();
    const user = await seedTestUser(db, { name: "Tester" });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.name).toBe("Tester");
    expect(row.role).toBe("user"); // schema default survived migration
  });
});
```

Run: `pnpm test src/test/db.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 4: Implement the harness**

`src/test/db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createId } from "@paralleldrive/cuid2";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function seedTestUser(
  db: TestDb,
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const [row] = await db
    .insert(users)
    .values({
      id: createId(),
      name: "Test User",
      email: `${createId()}@test.local`,
      ...overrides,
    })
    .returning({ id: users.id });
  return row;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm test src/test/db.test.ts` → Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PGlite test harness and DBClient type"
```

---

### Task 3: Product input validation (zod)

**Files:**
- Create: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces from `src/lib/validation.ts`:
  - `productInputSchema` (zod schema)
  - `type ProductInput = z.infer<typeof productInputSchema>` — `{ name: string; taglineId?: string; taglineEn?: string; descriptionId?: string; descriptionEn?: string; websiteUrl: string; categoryIds: string[] }`
  - `parseProductForm(formData: FormData): { ok: true; data: ProductInput } | { ok: false; errors: Record<string, string> }` — errors map field name → i18n key.

- [ ] **Step 1: Install zod**

```bash
pnpm add zod
```

- [ ] **Step 2: Write failing tests**

`src/lib/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseProductForm } from "./validation";

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  return fd;
}

const valid = {
  name: "Kopi Kirim",
  taglineId: "Kirim kopi ke temanmu",
  websiteUrl: "https://kopikirim.id",
  categoryIds: ["cat1"],
};

describe("parseProductForm", () => {
  it("accepts a valid submission", () => {
    const r = parseProductForm(form(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Kopi Kirim");
      expect(r.data.taglineEn).toBeUndefined(); // empty -> undefined
    }
  });

  it("rejects a too-short name with an i18n key", () => {
    const r = parseProductForm(form({ ...valid, name: "ab" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBe("validation.nameTooShort");
  });

  it("requires at least one tagline", () => {
    const r = parseProductForm(form({ ...valid, taglineId: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.taglineId).toBe("validation.taglineRequired");
  });

  it("rejects an invalid URL", () => {
    const r = parseProductForm(form({ ...valid, websiteUrl: "not a url" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.websiteUrl).toBe("validation.urlInvalid");
  });

  it("requires at least one category", () => {
    const r = parseProductForm(form({ ...valid, categoryIds: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.categoryIds).toBe("validation.categoryRequired");
  });

  it("rejects more than three categories", () => {
    const r = parseProductForm(
      form({ ...valid, categoryIds: ["a", "b", "c", "d"] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.categoryIds).toBe("validation.categoryTooMany");
  });
});
```

Run: `pnpm test src/lib/validation.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/validation.ts`:

```ts
import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, "validation.tooLong").optional(),
  );

export const productInputSchema = z
  .object({
    name: z
      .string("validation.nameRequired")
      .trim()
      .min(3, "validation.nameTooShort")
      .max(80, "validation.nameTooLong"),
    taglineId: optionalText(140),
    taglineEn: optionalText(140),
    descriptionId: optionalText(5000),
    descriptionEn: optionalText(5000),
    websiteUrl: z
      .string("validation.urlInvalid")
      .trim()
      .url("validation.urlInvalid")
      .max(300, "validation.tooLong"),
    categoryIds: z
      .array(z.string())
      .min(1, "validation.categoryRequired")
      .max(3, "validation.categoryTooMany"),
  })
  .refine((d) => d.taglineId || d.taglineEn, {
    message: "validation.taglineRequired",
    path: ["taglineId"],
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export function parseProductForm(
  formData: FormData,
):
  | { ok: true; data: ProductInput }
  | { ok: false; errors: Record<string, string> } {
  const raw = {
    name: formData.get("name"),
    taglineId: formData.get("taglineId"),
    taglineEn: formData.get("taglineEn"),
    descriptionId: formData.get("descriptionId"),
    descriptionEn: formData.get("descriptionEn"),
    websiteUrl: formData.get("websiteUrl"),
    categoryIds: formData.getAll("categoryIds").map(String),
  };
  const result = productInputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
```

API note: if the installed zod major has moved URL validation to top-level (`z.url()`) and `z.string().url()` emits a deprecation warning, use `z.url("validation.urlInvalid").max(...)` instead — same behavior, and test output must stay pristine. Similarly, if `z.string("key")` isn't accepted as the required-error shorthand in the installed version, use `z.string({ message: "validation.nameRequired" })`.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test src/lib/validation.test.ts` → Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add product submission validation"
```

---

### Task 4: Product + category query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/products.ts`
- Create: `src/db/queries/categories.ts`
- Test: `src/db/queries/products.test.ts`

**Interfaces:**
- Consumes: `DBClient`/`db`, schema tables, `slugify`/`ensureUniqueSlug` from `src/lib/slug.ts`, test harness from Task 2.
- Produces (all functions take `dbc: DBClient = db` as last param):
  - `slugExists(slug: string, dbc?): Promise<boolean>`
  - `createProduct(data: NewProductData, dbc?): Promise<{id: string; slug: string}>` where `NewProductData = { name: string; taglineId?: string; taglineEn?: string; descriptionId?: string; descriptionEn?: string; websiteUrl: string; logoUrl?: string; screenshotUrls: string[]; categoryIds: string[]; makerId: string }`
  - `listFeed(sort: FeedSort, dbc?): Promise<FeedItem[]>` where `FeedSort = "popular" | "newest"` and `FeedItem = { id: string; slug: string; name: string; taglineId: string | null; taglineEn: string | null; logoUrl: string | null; voteCount: number; commentCount: number; launchedAt: Date | null; makerName: string | null }`
  - `getProductBySlug(slug: string, dbc?): Promise<ProductDetail | null>` where `ProductDetail = { product: typeof products.$inferSelect; makerName: string | null; images: {url: string; sortOrder: number}[]; categories: {slug: string; nameId: string; nameEn: string}[] }`
  - `listPending(dbc?): Promise<PendingItem[]>` where `PendingItem = { id: string; slug: string; name: string; taglineId: string | null; taglineEn: string | null; websiteUrl: string; logoUrl: string | null; createdAt: Date; makerName: string | null }`
  - `approveProduct(id: string, dbc?): Promise<boolean>` — sets `status='approved'`, `launchedAt=now()`; only from `pending`; returns whether a row changed
  - `rejectProduct(id: string, reason: string | null, dbc?): Promise<boolean>` — sets `status='rejected'`, stores reason; only from `pending`
  - From `categories.ts`: `listCategories(dbc?): Promise<{id: string; slug: string; nameId: string; nameEn: string}[]>` ordered by slug.

- [ ] **Step 1: Write failing tests**

`src/db/queries/products.test.ts`:

```ts
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

describe("listCategories", () => {
  it("returns seeded categories ordered by slug", async () => {
    await db
      .insert(categories)
      .values({ slug: "saas", nameId: "SaaS", nameEn: "SaaS" });
    const cats = await listCategories(db);
    expect(cats.map((c) => c.slug)).toEqual(["ai", "saas"]);
  });
});
```

Run: `pnpm test src/db/queries/products.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 2: Implement the queries**

`src/db/queries/categories.ts`:

```ts
import { asc } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { categories } from "@/db/schema";

export async function listCategories(dbc: DBClient = db) {
  return dbc
    .select({
      id: categories.id,
      slug: categories.slug,
      nameId: categories.nameId,
      nameEn: categories.nameEn,
    })
    .from(categories)
    .orderBy(asc(categories.slug));
}
```

`src/db/queries/products.ts`:

```ts
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
```

- [ ] **Step 3: Run, verify pass**

Run: `pnpm test src/db/queries/products.test.ts` → Expected: PASS (all 8).

- [ ] **Step 4: Full suite + commit**

Run: `pnpm test` → all pass, pristine.

```bash
git add -A
git commit -m "feat: add product and category query layer"
```

---

### Task 5: Image storage module

**Files:**
- Create: `src/lib/storage.ts`
- Modify: `.gitignore` (add `public/uploads/`)
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `@vercel/blob` (`put`), Node `fs/promises`.
- Produces from `src/lib/storage.ts`:
  - `MAX_IMAGE_BYTES = 4 * 1024 * 1024`
  - `validateImage(file: { type: string; size: number }): string | null` — returns an i18n error key or null.
  - `putImage(file: File): Promise<string>` — returns a public URL. Uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; otherwise writes to `public/uploads/` (or `$UPLOADS_BASE_DIR/uploads/` when that env var is set — used by tests) and returns `/uploads/<name>`.

- [ ] **Step 1: Install @vercel/blob**

```bash
pnpm add @vercel/blob
```

- [ ] **Step 2: Write failing tests**

`src/lib/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { validateImage, putImage, MAX_IMAGE_BYTES } from "./storage";

describe("validateImage", () => {
  it("accepts jpeg/png/webp under the size cap", () => {
    expect(validateImage({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImage({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateImage({ type: "image/webp", size: 1000 })).toBeNull();
  });
  it("rejects other content types", () => {
    expect(validateImage({ type: "image/gif", size: 10 })).toBe(
      "validation.imageType",
    );
    expect(validateImage({ type: "text/html", size: 10 })).toBe(
      "validation.imageType",
    );
  });
  it("rejects oversized files", () => {
    expect(
      validateImage({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }),
    ).toBe("validation.imageSize");
  });
});

describe("putImage local fallback", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "storage-test-"));
    process.env.UPLOADS_BASE_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterEach(async () => {
    delete process.env.UPLOADS_BASE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the file and returns a /uploads path", async () => {
    const file = new File([Buffer.from("fake-png")], "logo.png", {
      type: "image/png",
    });
    const url = await putImage(file);
    expect(url).toMatch(/^\/uploads\/[A-Za-z0-9-]+\.png$/);
    const written = await readFile(path.join(dir, url));
    expect(written.toString()).toBe("fake-png");
  });

  it("throws the validation key for a bad type", async () => {
    const file = new File([Buffer.from("x")], "x.gif", { type: "image/gif" });
    await expect(putImage(file)).rejects.toThrow("validation.imageType");
  });
});
```

Run: `pnpm test src/lib/storage.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/storage.ts`:

```ts
import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { put } from "@vercel/blob";

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function validateImage(file: {
  type: string;
  size: number;
}): string | null {
  if (!(file.type in ALLOWED)) return "validation.imageType";
  if (file.size > MAX_IMAGE_BYTES) return "validation.imageSize";
  return null;
}

export async function putImage(file: File): Promise<string> {
  const error = validateImage(file);
  if (error) throw new Error(error);
  const name = `${randomUUID()}${ALLOWED[file.type]}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`products/${name}`, file, { access: "public" });
    return blob.url;
  }

  // Dev fallback: write under public/ so next dev serves it.
  const baseDir =
    process.env.UPLOADS_BASE_DIR ?? path.join(process.cwd(), "public");
  const rel = `/uploads/${name}`;
  const abs = path.join(baseDir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return rel;
}
```

Add to `.gitignore`:

```
public/uploads/
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test src/lib/storage.test.ts` → Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add image storage module with Blob and dev fallback"
```

---

### Task 6: Submit page (form + server action)

**Files:**
- Create: `src/app/[locale]/submit/page.tsx`
- Create: `src/app/[locale]/submit/actions.ts`
- Create: `src/components/SubmitForm.tsx`
- Create: `src/lib/locale-content.ts`
- Modify: `messages/en.json`, `messages/id.json`
- Test: `src/lib/locale-content.test.ts`

**Interfaces:**
- Consumes: `auth`/`signIn` from `src/auth.ts`, `parseProductForm` (Task 3), `putImage`/`validateImage` (Task 5), `createProduct`/`listCategories` (Task 4), `getLocale`/`getTranslations` from `next-intl/server`.
- Produces:
  - Server action `submitProduct(prev: SubmitState, formData: FormData): Promise<SubmitState>` with `SubmitState = { errors: Record<string, string> }` (redirects on success).
  - `pickLocalized(row: { taglineId: string | null; taglineEn: string | null; descriptionId: string | null; descriptionEn: string | null }, locale: string): { tagline: string | null; description: string | null }` from `src/lib/locale-content.ts` — prefers the viewer's locale, falls back to the other. (Also consumed by Tasks 7 and 8.)

- [ ] **Step 1: TDD the locale-content helper**

`src/lib/locale-content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickLocalized } from "./locale-content";

const row = {
  taglineId: "Kirim kopi",
  taglineEn: null,
  descriptionId: null,
  descriptionEn: "An English description",
};

describe("pickLocalized", () => {
  it("prefers the viewer locale", () => {
    expect(pickLocalized(row, "id").tagline).toBe("Kirim kopi");
    expect(pickLocalized(row, "en").description).toBe(
      "An English description",
    );
  });
  it("falls back to the other locale when missing", () => {
    expect(pickLocalized(row, "en").tagline).toBe("Kirim kopi");
    expect(pickLocalized(row, "id").description).toBe(
      "An English description",
    );
  });
  it("returns null when neither exists", () => {
    expect(
      pickLocalized(
        { taglineId: null, taglineEn: null, descriptionId: null, descriptionEn: null },
        "id",
      ).tagline,
    ).toBeNull();
  });
});
```

Run → FAIL. Then implement `src/lib/locale-content.ts`:

```ts
type LocalizedRow = {
  taglineId: string | null;
  taglineEn: string | null;
  descriptionId: string | null;
  descriptionEn: string | null;
};

export function pickLocalized(row: LocalizedRow, locale: string) {
  const id = locale === "id";
  return {
    tagline: (id ? row.taglineId : row.taglineEn) ?? (id ? row.taglineEn : row.taglineId),
    description:
      (id ? row.descriptionId : row.descriptionEn) ??
      (id ? row.descriptionEn : row.descriptionId),
  };
}
```

Run → PASS.

- [ ] **Step 2: Add the i18n strings (both catalogs — parity test enforces)**

Merge into `messages/en.json`:

```json
{
  "submit": {
    "title": "Submit a product",
    "signInFirst": "Sign in to submit your product.",
    "name": "Product name",
    "taglineId": "Tagline (Indonesian)",
    "taglineEn": "Tagline (English)",
    "taglineHint": "Fill at least one tagline.",
    "descriptionId": "Description (Indonesian, markdown)",
    "descriptionEn": "Description (English, markdown)",
    "website": "Website URL",
    "categories": "Categories (up to 3)",
    "logo": "Logo",
    "screenshots": "Screenshots (up to 4)",
    "send": "Submit for review",
    "success": "Submitted! Your product is now waiting for review."
  },
  "validation": {
    "nameRequired": "Name is required.",
    "nameTooShort": "Name must be at least 3 characters.",
    "nameTooLong": "Name is too long.",
    "tooLong": "This field is too long.",
    "taglineRequired": "Fill in at least one tagline.",
    "urlInvalid": "Enter a valid URL (https://...).",
    "categoryRequired": "Pick at least one category.",
    "categoryTooMany": "Pick at most 3 categories.",
    "imageType": "Images must be JPEG, PNG, or WebP.",
    "imageSize": "Images must be 4 MB or smaller.",
    "screenshotsTooMany": "At most 4 screenshots.",
    "formError": "Something went wrong. Check the fields and try again."
  }
}
```

Merge into `messages/id.json`:

```json
{
  "submit": {
    "title": "Kirim produk",
    "signInFirst": "Masuk dulu untuk mengirim produkmu.",
    "name": "Nama produk",
    "taglineId": "Tagline (Bahasa Indonesia)",
    "taglineEn": "Tagline (Bahasa Inggris)",
    "taglineHint": "Isi minimal satu tagline.",
    "descriptionId": "Deskripsi (Bahasa Indonesia, markdown)",
    "descriptionEn": "Deskripsi (Bahasa Inggris, markdown)",
    "website": "URL situs",
    "categories": "Kategori (maksimal 3)",
    "logo": "Logo",
    "screenshots": "Tangkapan layar (maksimal 4)",
    "send": "Kirim untuk ditinjau",
    "success": "Terkirim! Produkmu sedang menunggu peninjauan."
  },
  "validation": {
    "nameRequired": "Nama wajib diisi.",
    "nameTooShort": "Nama minimal 3 karakter.",
    "nameTooLong": "Nama terlalu panjang.",
    "tooLong": "Kolom ini terlalu panjang.",
    "taglineRequired": "Isi minimal satu tagline.",
    "urlInvalid": "Masukkan URL yang valid (https://...).",
    "categoryRequired": "Pilih minimal satu kategori.",
    "categoryTooMany": "Pilih maksimal 3 kategori.",
    "imageType": "Gambar harus JPEG, PNG, atau WebP.",
    "imageSize": "Ukuran gambar maksimal 4 MB.",
    "screenshotsTooMany": "Maksimal 4 tangkapan layar.",
    "formError": "Ada yang salah. Periksa kolom lalu coba lagi."
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → Expected: PASS (parity holds).

- [ ] **Step 3: Write the server action**

`src/app/[locale]/submit/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { parseProductForm } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { createProduct } from "@/db/queries/products";

export type SubmitState = { errors: Record<string, string> };

function pickFiles(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function submitProduct(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user) redirect(`/${locale}/submit`);

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" } };
  }
  for (const f of [...logoFiles, ...screenshotFiles]) {
    const err = validateImage(f);
    if (err) return { errors: { [f === logoFiles[0] ? "logo" : "screenshots"]: err } };
  }

  const logoUrl = logoFiles[0] ? await putImage(logoFiles[0]) : undefined;
  const screenshotUrls: string[] = [];
  for (const f of screenshotFiles) screenshotUrls.push(await putImage(f));

  await createProduct({
    ...parsed.data,
    logoUrl,
    screenshotUrls,
    makerId: session.user.id,
  });

  redirect(`/${locale}/submit?ok=1`);
}
```

- [ ] **Step 4: Write the page and form**

`src/app/[locale]/submit/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { listCategories } from "@/db/queries/categories";
import { SubmitForm } from "@/components/SubmitForm";

export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { locale } = await params;
  const { ok } = await searchParams;
  const t = await getTranslations("submit");
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-gray-600">{t("signInFirst")}</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/${locale}/submit` });
          }}
        >
          <button
            type="submit"
            className="mt-4 rounded-md bg-black px-4 py-2 text-white"
          >
            {t("signInFirst")}
          </button>
        </form>
      </div>
    );
  }

  if (ok === "1") {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 rounded-md bg-green-50 p-4 text-green-800">
          {t("success")}
        </p>
      </div>
    );
  }

  const cats = await listCategories();
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SubmitForm categories={catOptions} />
    </div>
  );
}
```

`src/components/SubmitForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitProduct, type SubmitState } from "@/app/[locale]/submit/actions";

const initialState: SubmitState = { errors: {} };

function FieldError({ k }: { k?: string }) {
  const t = useTranslations();
  if (!k) return null;
  return <p className="mt-1 text-sm text-red-600">{t(k)}</p>;
}

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-black focus:outline-none";

export function SubmitForm({
  categories,
}: {
  categories: { id: string; label: string }[];
}) {
  const t = useTranslations("submit");
  const [state, formAction, pending] = useActionState(
    submitProduct,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className="block">
        <span className="font-medium">{t("name")}</span>
        <input name="name" required className={inputCls} />
        <FieldError k={state.errors.name} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">{t("taglineId")}</span>
          <input name="taglineId" className={inputCls} />
          <FieldError k={state.errors.taglineId} />
        </label>
        <label className="block">
          <span className="font-medium">{t("taglineEn")}</span>
          <input name="taglineEn" className={inputCls} />
        </label>
      </div>
      <p className="text-sm text-gray-500">{t("taglineHint")}</p>

      <label className="block">
        <span className="font-medium">{t("descriptionId")}</span>
        <textarea name="descriptionId" rows={5} className={inputCls} />
        <FieldError k={state.errors.descriptionId} />
      </label>
      <label className="block">
        <span className="font-medium">{t("descriptionEn")}</span>
        <textarea name="descriptionEn" rows={5} className={inputCls} />
      </label>

      <label className="block">
        <span className="font-medium">{t("website")}</span>
        <input
          name="websiteUrl"
          type="url"
          placeholder="https://"
          required
          className={inputCls}
        />
        <FieldError k={state.errors.websiteUrl} />
      </label>

      <fieldset>
        <legend className="font-medium">{t("categories")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categoryIds" value={c.id} />
              {c.label}
            </label>
          ))}
        </div>
        <FieldError k={state.errors.categoryIds} />
      </fieldset>

      <label className="block">
        <span className="font-medium">{t("logo")}</span>
        <input
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block"
        />
        <FieldError k={state.errors.logo} />
      </label>

      <label className="block">
        <span className="font-medium">{t("screenshots")}</span>
        <input
          name="screenshots"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="mt-1 block"
        />
        <FieldError k={state.errors.screenshots} />
      </label>

      <FieldError k={state.errors.form} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {t("send")}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm test` → all pass, pristine.
Run: `pnpm build` → succeeds.

Manual smoke (needs Google OAuth in `.env.local`): `pnpm dev`, sign in, submit a product with a logo → success banner; check the `products` row in Neon (status `pending`) and the file under `public/uploads/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add product submission page with uploads"
```

---

### Task 7: Home feed (Popular/Newest) + Tailwind sweep

**Files:**
- Modify: `src/app/[locale]/page.tsx` (replace placeholder with the feed)
- Create: `src/components/ProductCard.tsx`
- Modify: `src/components/Header.tsx`, `src/components/AuthButtons.tsx` (inline styles → Tailwind)
- Modify: `next.config.ts` (images remotePatterns for Vercel Blob)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `listFeed`/`FeedItem` (Task 4), `pickLocalized` (Task 6), `Link` from `src/i18n/navigation.ts`.
- Produces: `ProductCard({ item, locale }: { item: FeedItem; locale: string })` server component — also reused stylistically by Task 9.

- [ ] **Step 1: i18n strings (both catalogs)**

Merge into `messages/en.json` under the existing `home` object and a new `feed` object:

```json
{
  "feed": {
    "empty": "No products yet. Be the first to launch!",
    "by": "by {name}",
    "votes": "{count} votes"
  }
}
```

`messages/id.json`:

```json
{
  "feed": {
    "empty": "Belum ada produk. Jadilah yang pertama meluncurkan!",
    "by": "oleh {name}",
    "votes": "{count} suara"
  }
}
```

(The `home.popular` / `home.newest` keys from Phase 1 label the toggle.)
Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: Allow Blob-hosted images in next/image**

`next.config.ts` — add inside `nextConfig`:

```ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};
```

- [ ] **Step 3: ProductCard**

`src/components/ProductCard.tsx`:

```tsx
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/lib/locale-content";
import type { FeedItem } from "@/db/queries/products";

export async function ProductCard({
  item,
  locale,
}: {
  item: FeedItem;
  locale: string;
}) {
  const t = await getTranslations("feed");
  const { tagline } = pickLocalized(
    { ...item, descriptionId: null, descriptionEn: null },
    locale,
  );

  return (
    <Link
      href={`/products/${item.slug}`}
      className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 hover:border-gray-400"
    >
      {item.logoUrl ? (
        <Image
          src={item.logoUrl}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-gray-100 text-xl font-bold text-gray-400">
          {item.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">{item.name}</h2>
        {tagline && <p className="truncate text-sm text-gray-600">{tagline}</p>}
        {item.makerName && (
          <p className="text-xs text-gray-400">
            {t("by", { name: item.makerName })}
          </p>
        )}
      </div>
      <div className="flex flex-col items-center rounded-md border border-gray-200 px-3 py-1">
        <span className="text-sm font-bold">▲</span>
        <span className="text-sm">{item.voteCount}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: The feed page**

Replace `src/app/[locale]/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listFeed, type FeedSort } from "@/db/queries/products";
import { ProductCard } from "@/components/ProductCard";

export default async function Home({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { locale } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: FeedSort = sortParam === "newest" ? "newest" : "popular";
  const t = await getTranslations();
  const items = await listFeed(sort);

  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium ${
      active ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("app.tagline")}</h1>
        <nav className="flex gap-1">
          <Link href="/?sort=popular" className={tabCls(sort === "popular")}>
            {t("home.popular")}
          </Link>
          <Link href="/?sort=newest" className={tabCls(sort === "newest")}>
            {t("home.newest")}
          </Link>
        </nav>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {items.length === 0 && (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("feed.empty")}
          </p>
        )}
        {items.map((item) => (
          <ProductCard key={item.id} item={item} locale={locale} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Tailwind sweep of Phase 1 components**

`src/components/Header.tsx` — replace the inline styles:

```tsx
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButtons } from "./AuthButtons";

export async function Header() {
  const t = await getTranslations();
  return (
    <header className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
      <Link href="/" className="font-bold">
        {t("app.name")}
      </Link>
      <div className="flex-1" />
      <Link href="/submit" className="text-sm text-gray-700 hover:text-black">
        {t("nav.submit")}
      </Link>
      <LanguageSwitcher />
      <AuthButtons />
    </header>
  );
}
```

`src/components/AuthButtons.tsx` — keep the logic (including `getLocale` redirects) but swap inline styles for `className="text-sm"` on the name span (`mr-2`) and `className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"` on both buttons. `src/components/LanguageSwitcher.tsx` — replace `style={{ margin: 4 }}` with `className="mx-1 text-sm text-gray-600 hover:text-black"`.

- [ ] **Step 6: Verify + commit**

Run: `pnpm test` → all pass. Run: `pnpm build` → succeeds.
Manual smoke: approve nothing yet → feed shows the empty state; after Task 9 approval it shows cards.

```bash
git add -A
git commit -m "feat: add home feed with popular/newest toggle, Tailwind sweep"
```

---

### Task 8: Product detail page

**Files:**
- Create: `src/app/[locale]/products/[slug]/page.tsx`
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `getProductBySlug` (Task 4), `pickLocalized` (Task 6), `auth`, `isAdmin` from `src/auth-helpers.ts`, `react-markdown`.
- Produces: public route `/{locale}/products/{slug}`.

- [ ] **Step 1: Install react-markdown**

```bash
pnpm add react-markdown
```

- [ ] **Step 2: i18n strings (both catalogs)**

`messages/en.json`:

```json
{
  "product": {
    "visit": "Visit website",
    "pendingBanner": "This product is waiting for review and is only visible to you.",
    "rejectedBanner": "This product was rejected. Reason: {reason}",
    "noReason": "not provided",
    "by": "by {name}"
  }
}
```

`messages/id.json`:

```json
{
  "product": {
    "visit": "Kunjungi situs",
    "pendingBanner": "Produk ini sedang menunggu peninjauan dan hanya terlihat olehmu.",
    "rejectedBanner": "Produk ini ditolak. Alasan: {reason}",
    "noReason": "tidak diberikan",
    "by": "oleh {name}"
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 3: The page**

`src/app/[locale]/products/[slug]/page.tsx`:

```tsx
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { getProductBySlug } from "@/db/queries/products";
import { pickLocalized } from "@/lib/locale-content";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail) notFound();

  const { product, makerName, images, categories } = detail;
  const session = await auth();
  const viewerIsMaker = session?.user?.id === product.makerId;
  const viewerIsAdmin = isAdmin(session);

  if (product.status !== "approved" && !viewerIsMaker && !viewerIsAdmin) {
    notFound();
  }

  const t = await getTranslations("product");
  const { tagline, description } = pickLocalized(product, locale);

  return (
    <article className="mx-auto max-w-2xl p-6">
      {product.status === "pending" && (
        <p className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          {t("pendingBanner")}
        </p>
      )}
      {product.status === "rejected" && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {t("rejectedBanner", {
            reason: product.rejectionReason ?? t("noReason"),
          })}
        </p>
      )}

      <div className="flex items-center gap-4">
        {product.logoUrl && (
          <Image
            src={product.logoUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {tagline && <p className="text-gray-600">{tagline}</p>}
          {makerName && (
            <p className="text-sm text-gray-400">{t("by", { name: makerName })}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <span
            key={c.slug}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
          >
            {locale === "id" ? c.nameId : c.nameEn}
          </span>
        ))}
        <a
          href={product.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          {t("visit")}
        </a>
      </div>

      {description && (
        <div className="prose prose-sm mt-6 max-w-none">
          <ReactMarkdown>{description}</ReactMarkdown>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {images.map((img) => (
            <Image
              key={img.url}
              src={img.url}
              alt=""
              width={1280}
              height={720}
              className="h-auto w-full rounded-lg border border-gray-200"
            />
          ))}
        </div>
      )}
    </article>
  );
}
```

Note: `react-markdown` does not render raw HTML by default — keep it that way (no `rehype-raw`).

- [ ] **Step 4: Verify + commit**

Run: `pnpm test` → all pass. Run: `pnpm build` → succeeds.
Manual smoke: open a pending product's URL as its maker (banner shows); open it in a private window (404).

```bash
git add -A
git commit -m "feat: add product detail page"
```

---

### Task 9: Admin approval queue

**Files:**
- Create: `src/app/[locale]/admin/page.tsx`
- Create: `src/app/[locale]/admin/actions.ts`
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `listPending`/`approveProduct`/`rejectProduct` (Task 4), `auth`, `assertAdmin`/`isAdmin` (`src/auth-helpers.ts`), `revalidatePath` from `next/cache`.
- Produces: role-gated route `/{locale}/admin`; server actions `approveAction(formData)` / `rejectAction(formData)`.

- [ ] **Step 1: i18n strings (both catalogs)**

`messages/en.json`:

```json
{
  "admin": {
    "title": "Approval queue",
    "empty": "No pending products. 🎉",
    "approve": "Approve",
    "reject": "Reject",
    "reasonPlaceholder": "Rejection reason (optional)",
    "submittedBy": "by {name}",
    "view": "View"
  }
}
```

`messages/id.json`:

```json
{
  "admin": {
    "title": "Antrean peninjauan",
    "empty": "Tidak ada produk menunggu. 🎉",
    "approve": "Setujui",
    "reject": "Tolak",
    "reasonPlaceholder": "Alasan penolakan (opsional)",
    "submittedBy": "oleh {name}",
    "view": "Lihat"
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: The actions**

`src/app/[locale]/admin/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertAdmin } from "@/auth-helpers";
import { approveProduct, rejectProduct } from "@/db/queries/products";

export async function approveAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  if (id) await approveProduct(id);
  revalidatePath("/", "layout");
}

export async function rejectAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (id) await rejectProduct(id, reason);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 3: The page**

`src/app/[locale]/admin/page.tsx`:

```tsx
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { listPending } from "@/db/queries/products";
import { Link } from "@/i18n/navigation";
import { approveAction, rejectAction } from "./actions";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!isAdmin(session)) redirect(`/${locale}`);

  const t = await getTranslations("admin");
  const pending = await listPending();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      {pending.length === 0 && (
        <p className="mt-6 rounded-md bg-gray-50 p-6 text-center text-gray-500">
          {t("empty")}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {pending.map((p) => (
          <div key={p.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              {p.logoUrl && (
                <Image
                  src={p.logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-md object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                {p.makerName && (
                  <p className="text-xs text-gray-400">
                    {t("submittedBy", { name: p.makerName })}
                  </p>
                )}
              </div>
              <Link
                href={`/products/${p.slug}`}
                className="text-sm text-gray-600 underline"
              >
                {t("view")}
              </Link>
            </div>

            <div className="mt-3 flex items-start gap-2">
              <form action={approveAction}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  {t("approve")}
                </button>
              </form>
              <form action={rejectAction} className="flex flex-1 gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="reason"
                  placeholder={t("reasonPlaceholder")}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  {t("reject")}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm test` → all pass. Run: `pnpm build` → succeeds.
Manual smoke: as a non-admin, `/admin` redirects home. Bootstrap your admin role (README SQL), approve a pending product → it appears on the feed with `launchedAt` set.

```bash
git add -A
git commit -m "feat: add admin approval queue"
```

---

### Task 10: Cleanup + end-to-end verification

**Files:**
- Delete: `src/lib/sample.ts`, `src/lib/sample.test.ts` (harness smoke no longer needed — real suites exist)
- Modify: `.superpowers` nothing; ledger only.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified Phase 2.

- [ ] **Step 1: Remove the sample harness files**

```bash
git rm src/lib/sample.ts src/lib/sample.test.ts
```

- [ ] **Step 2: Full verification**

Run: `pnpm test` → all suites pass, pristine output.
Run: `npx tsc --noEmit` → clean.
Run: `pnpm build` → succeeds.

- [ ] **Step 3: Manual end-to-end smoke (requires .env.local with DB + Google OAuth)**

With `pnpm dev`:
1. Sign in with Google → header shows name.
2. `/submit` → fill form (name, one tagline, URL, one category, logo file) → success banner; row in Neon with `status='pending'`.
3. Open the new product's detail URL while signed in → pending banner. Private window → 404.
4. Promote your user to admin (README SQL) → `/admin` shows the product → Approve.
5. Home feed shows the product (Popular and Newest); detail page now public; `launched_at` set (timestamptz).
6. Switch locale to EN → all new pages render English strings.

Record any deviation as a concern rather than silently fixing unrelated things.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove sample harness files after Phase 2 verification"
```

---

## Self-Review

- **Spec coverage (Phase 2 scope):** submit with Blob uploads (Tasks 5–6) ✓; admin approval queue with reject reason (Tasks 4, 9) ✓; live feed Popular/Newest, approved-only (Tasks 4, 7) ✓; product detail with markdown + screenshots + pending visibility rule (Tasks 4, 8) ✓; slug generation with collision suffix + empty-base fallback (Task 4, closes the deferred slugify gap) ✓; categories at submission (Tasks 1, 4, 6) ✓; bilingual UI incl. validation messages (Tasks 6–9) ✓; carried-over backlog: README + admin bootstrap (Task 1), /submit dead link (Task 6), Tailwind convention (global constraint + Task 7 sweep) ✓.
- **Placeholder scan:** no TBD/TODO; all code steps carry complete code; the two zod API notes and one DBClient note are explicit contingency instructions, not gaps.
- **Type consistency:** `DBClient` (Task 2) used by every Task 4 signature; `FeedItem`/`FeedSort`/`ProductDetail`/`PendingItem` defined in Task 4 and consumed by Tasks 7–9 under the same names; `pickLocalized` defined in Task 6, consumed in Tasks 7–8; `SubmitState = { errors }` consistent between action and form; `putImage`/`validateImage` names match between Tasks 5 and 6.
