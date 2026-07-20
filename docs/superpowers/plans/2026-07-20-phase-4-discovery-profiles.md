# Phase 4: Discovery & Profiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship discovery and identity: category pages, product search, and public user profiles showing submissions and upvoted products.

**Architecture:** Same layering as Phases 2–3. New query modules (`src/db/queries/discovery.ts`, `src/db/queries/users.ts`) TDD'd on PGlite. Usernames (needed for profile URLs, never populated until now) are generated at first sign-in via an Auth.js `createUser` event calling a TDD'd `assignUsername` query function, with an idempotent backfill script for any existing rows. Pages reuse `ProductCard`/`VoteButton`/`getVotedProductIds` patterns from Phase 3. The header gains a locale-aware client search form.

**Tech Stack:** Existing stack only — no new dependencies.

## Global Constraints

- Package manager: **pnpm**. TypeScript `strict: true`. Tailwind only — no inline `style={{}}`.
- Every user-facing string in BOTH catalogs (parity test). Errors as i18n keys.
- All DB access via query functions in `src/db/queries/*`, Drizzle core API, last param `dbc: DBClient = db`. PGlite integration tests only — never the live DB from tests.
- Public listings show **approved products only**. A profile's non-approved submissions are visible only to the profile owner and admins (status badges shown there).
- Search: Postgres `ILIKE` over name + both taglines; **the user's query must be escaped** (`%`, `_`, `\`) before interpolation into the pattern; queries shorter than 2 chars (trimmed) return no results without hitting the DB.
- Usernames: generated from name (fallback: email local part; final fallback `"user"`), slugified, ≤30 chars base, uniqueness via `ensureUniqueSlug`. Generation is idempotent — an existing username is never overwritten.
- Profile routes: `/u/[username]`. Category routes: `/categories/[slug]`.
- Nested anchors are invalid HTML: maker-name links to profiles go on the **detail page only** (ProductCard's maker name stays plain text — the card is already wrapped in a Link).

## Prerequisite

`.env.local` has a working `DATABASE_URL` (Task 1's backfill runs against the live dev DB — likely a no-op since sign-ins may not have happened yet).

---

### Task 1: Username generation (event + backfill)

**Files:**
- Create: `src/lib/username.ts`
- Create: `src/db/queries/users.ts` (starts with `assignUsername`; Task 2 extends it)
- Create: `src/db/backfill-usernames.ts`
- Modify: `src/auth.ts` (add `events.createUser`)
- Modify: `package.json` (add `db:backfill-usernames` script)
- Test: `src/lib/username.test.ts`, `src/db/queries/users.test.ts`

**Interfaces:**
- Consumes: `slugify`/`ensureUniqueSlug` from `src/lib/slug.ts`, `DBClient`/`db`, `users` table, test harness.
- Produces:
  - `usernameBase(name: string | null | undefined, email: string | null | undefined): string` — pure; slugified name, else slugified email local part, else `"user"`; ≤30 chars.
  - `assignUsername(userId: string, dbc?): Promise<string | null>` — idempotent: returns the existing username if set; otherwise generates a unique one, stores it, returns it; `null` for unknown user.
  - Auth.js `createUser` event wired to `assignUsername`.
  - `pnpm db:backfill-usernames` — assigns usernames to all rows where `username IS NULL`; idempotent.

- [ ] **Step 1: TDD the pure helper**

`src/lib/username.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { usernameBase } from "./username";

describe("usernameBase", () => {
  it("slugifies the name", () => {
    expect(usernameBase("Prayoga Antara", "x@y.z")).toBe("prayoga-antara");
  });
  it("falls back to the email local part", () => {
    expect(usernameBase(null, "budi.s@example.com")).toBe("budis");
    expect(usernameBase("!!!", "budi.s@example.com")).toBe("budis");
  });
  it("falls back to 'user' when nothing usable", () => {
    expect(usernameBase(null, null)).toBe("user");
    expect(usernameBase("!!!", "!!!@x.y")).toBe("user");
  });
  it("caps the base at 30 chars", () => {
    expect(usernameBase("a".repeat(50), null)).toHaveLength(30);
  });
});
```

Run: `pnpm test src/lib/username.test.ts` → FAIL (module not found). Then implement `src/lib/username.ts`:

```ts
import { slugify } from "./slug";

export function usernameBase(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromName = name ? slugify(name) : "";
  if (fromName) return fromName.slice(0, 30);
  const local = email ? email.split("@")[0] : "";
  const fromEmail = slugify(local);
  return (fromEmail || "user").slice(0, 30);
}
```

Run → PASS (4/4).

- [ ] **Step 2: TDD assignUsername on PGlite**

`src/db/queries/users.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assignUsername } from "./users";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

describe("assignUsername", () => {
  it("assigns a slugified username from the name", async () => {
    const u = await seedTestUser(db, { name: "Budi Santoso" });
    expect(await assignUsername(u.id, db)).toBe("budi-santoso");
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.username).toBe("budi-santoso");
  });

  it("is idempotent — never overwrites an existing username", async () => {
    const u = await seedTestUser(db, { name: "Budi", username: "custom" });
    expect(await assignUsername(u.id, db)).toBe("custom");
  });

  it("de-duplicates with a counter", async () => {
    const a = await seedTestUser(db, { name: "Sama Nama" });
    const b = await seedTestUser(db, { name: "Sama Nama" });
    await assignUsername(a.id, db);
    expect(await assignUsername(b.id, db)).toBe("sama-nama-2");
  });

  it("returns null for an unknown user", async () => {
    expect(await assignUsername("nope", db)).toBeNull();
  });
});
```

Run → FAIL. Then implement `src/db/queries/users.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { users } from "@/db/schema";
import { ensureUniqueSlug } from "@/lib/slug";
import { usernameBase } from "@/lib/username";

export async function assignUsername(
  userId: string,
  dbc: DBClient = db,
): Promise<string | null> {
  const [u] = await dbc
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;
  if (u.username) return u.username;

  const base = usernameBase(u.name, u.email);
  const username = await ensureUniqueSlug(base, async (candidate) => {
    const rows = await dbc
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    return rows.length > 0;
  });
  await dbc.update(users).set({ username }).where(eq(users.id, userId));
  return username;
}
```

Run → PASS (4/4).

- [ ] **Step 3: Wire the Auth.js event**

In `src/auth.ts`, add to the NextAuth config object (sibling of `callbacks`):

```ts
events: {
  async createUser({ user }) {
    if (user.id) await assignUsername(user.id);
  },
},
```

with `import { assignUsername } from "@/db/queries/users";` at the top.

- [ ] **Step 4: Backfill script**

`src/db/backfill-usernames.ts`:

```ts
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

async function main() {
  const { db } = await import("./index");
  const { users } = await import("./schema");
  const { assignUsername } = await import("./queries/users");
  const { isNull } = await import("drizzle-orm");

  const missing = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.username));
  for (const row of missing) {
    await assignUsername(row.id);
  }
  console.log(`Backfilled ${missing.length} username(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add to `package.json` scripts: `"db:backfill-usernames": "tsx src/db/backfill-usernames.ts"`.

- [ ] **Step 5: Run the backfill against the dev DB**

Run: `pnpm db:backfill-usernames`
Expected: `Backfilled N username(s).` (N is likely 0 — no sign-ins may have happened yet.)

- [ ] **Step 6: Full verification + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds.

```bash
git add -A
git commit -m "feat: generate usernames at sign-up with backfill"
```

---

### Task 2: Discovery + profile query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/discovery.ts`
- Modify: `src/db/queries/products.ts` (export `feedColumns`; add `makerUsername` to `getProductBySlug`)
- Modify: `src/db/queries/users.ts` (add profile queries)
- Test: `src/db/queries/discovery.test.ts`

**Interfaces:**
- Consumes: schema tables, `FeedItem`/`FeedSort`/`feedColumns` from products.ts, test harness.
- Produces:
  - products.ts: `feedColumns` becomes exported; `ProductDetail` gains `makerUsername: string | null` (selected from `users.username` in `getProductBySlug`).
  - discovery.ts:
    - `getCategoryBySlug(slug: string, dbc?): Promise<{id: string; slug: string; nameId: string; nameEn: string} | null>`
    - `listProductsByCategory(categoryId: string, sort: FeedSort, dbc?): Promise<FeedItem[]>` — approved only, limit 50, same ordering rules as `listFeed`.
    - `searchProducts(query: string, dbc?): Promise<FeedItem[]>` — trimmed query < 2 chars → `[]` without querying; ILIKE over name/taglineId/taglineEn with `%`/`_`/`\` escaped; approved only; ordered `voteCount desc`; limit 20.
  - users.ts additions:
    - `type ProfileUser = { id: string; username: string | null; name: string | null; image: string | null; bio: string | null; createdAt: Date }`
    - `getUserByUsername(username: string, dbc?): Promise<ProfileUser | null>`
    - `type MakerProduct = FeedItem & { status: string }`
    - `listProductsByMaker(makerId: string, includeNonApproved: boolean, dbc?): Promise<MakerProduct[]>` — ordered `createdAt desc`, limit 50.
    - `listVotedProducts(userId: string, dbc?): Promise<FeedItem[]>` — approved only, ordered by the vote's `createdAt desc`, limit 50.

- [ ] **Step 1: Export feedColumns and add makerUsername to the detail query**

In `src/db/queries/products.ts`:
- Change `const feedColumns = {` to `export const feedColumns = {`.
- In `getProductBySlug`'s first select, add `makerUsername: users.username` beside `makerName: users.name`, add `makerUsername: string | null` to the `ProductDetail` type, and include it in the returned object.

- [ ] **Step 2: Write failing tests**

`src/db/queries/discovery.test.ts`:

```ts
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
```

Run: `pnpm test src/db/queries/discovery.test.ts` → FAIL (modules not found).

- [ ] **Step 3: Implement discovery.ts**

`src/db/queries/discovery.ts`:

```ts
import { desc, eq, ilike, or, and } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { categories, productCategories, products, users } from "@/db/schema";
import { feedColumns, type FeedItem, type FeedSort } from "./products";

export async function getCategoryBySlug(slug: string, dbc: DBClient = db) {
  const rows = await dbc
    .select({
      id: categories.id,
      slug: categories.slug,
      nameId: categories.nameId,
      nameEn: categories.nameEn,
    })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProductsByCategory(
  categoryId: string,
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
    .innerJoin(productCategories, eq(productCategories.productId, products.id))
    .where(
      and(
        eq(products.status, "approved"),
        eq(productCategories.categoryId, categoryId),
      ),
    )
    .orderBy(...order)
    .limit(50);
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export async function searchProducts(
  query: string,
  dbc: DBClient = db,
): Promise<FeedItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${escapeLikePattern(q)}%`;
  return dbc
    .select(feedColumns)
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(
      and(
        eq(products.status, "approved"),
        or(
          ilike(products.name, pattern),
          ilike(products.taglineId, pattern),
          ilike(products.taglineEn, pattern),
        ),
      ),
    )
    .orderBy(desc(products.voteCount))
    .limit(20);
}
```

- [ ] **Step 4: Extend users.ts with the profile queries**

Append to `src/db/queries/users.ts` (extend the existing imports with `desc`, `and` from drizzle-orm and `products`, `votes` from the schema, plus `feedColumns`, `FeedItem` from `./products`):

```ts
export type ProfileUser = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  bio: string | null;
  createdAt: Date;
};

export async function getUserByUsername(
  username: string,
  dbc: DBClient = db,
): Promise<ProfileUser | null> {
  const rows = await dbc
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      bio: users.bio,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export type MakerProduct = FeedItem & { status: string };

export async function listProductsByMaker(
  makerId: string,
  includeNonApproved: boolean,
  dbc: DBClient = db,
): Promise<MakerProduct[]> {
  const cond = includeNonApproved
    ? eq(products.makerId, makerId)
    : and(eq(products.makerId, makerId), eq(products.status, "approved"));
  return dbc
    .select({ ...feedColumns, status: products.status })
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(cond)
    .orderBy(desc(products.createdAt))
    .limit(50);
}

export async function listVotedProducts(
  userId: string,
  dbc: DBClient = db,
): Promise<FeedItem[]> {
  return dbc
    .select(feedColumns)
    .from(votes)
    .innerJoin(products, eq(votes.productId, products.id))
    .innerJoin(users, eq(products.makerId, users.id))
    .where(and(eq(votes.userId, userId), eq(products.status, "approved")))
    .orderBy(desc(votes.createdAt))
    .limit(50);
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm test src/db/queries/discovery.test.ts` → PASS (all 9).

- [ ] **Step 6: Full suite + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean.

```bash
git add -A
git commit -m "feat: add discovery and profile query layer"
```

---

### Task 3: Category pages + linked category chips

**Files:**
- Create: `src/app/[locale]/categories/[slug]/page.tsx`
- Modify: `src/app/[locale]/page.tsx` (category chip strip)
- Modify: `src/app/[locale]/products/[slug]/page.tsx` (chips become links)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `getCategoryBySlug`/`listProductsByCategory` (Task 2), `listCategories`, `ProductCard`, `getVotedProductIds`, `auth`.
- Produces: route `/{locale}/categories/{slug}`.

- [ ] **Step 1: i18n (both catalogs)**

`messages/en.json`: add `"categories": { "empty": "No products in this category yet." }`
`messages/id.json`: add `"categories": { "empty": "Belum ada produk di kategori ini." }`
Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: Category page**

`src/app/[locale]/categories/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { getCategoryBySlug, listProductsByCategory } from "@/db/queries/discovery";
import { getVotedProductIds } from "@/db/queries/votes";
import type { FeedSort } from "@/db/queries/products";
import { ProductCard } from "@/components/ProductCard";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { locale, slug } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: FeedSort = sortParam === "newest" ? "newest" : "popular";

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const t = await getTranslations();
  const items = await listProductsByCategory(category.id, sort);
  const session = await auth();
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium ${
      active ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {locale === "id" ? category.nameId : category.nameEn}
        </h1>
        <nav className="flex gap-1">
          <Link
            href={`/categories/${slug}?sort=popular`}
            className={tabCls(sort === "popular")}
          >
            {t("home.popular")}
          </Link>
          <Link
            href={`/categories/${slug}?sort=newest`}
            className={tabCls(sort === "newest")}
          >
            {t("home.newest")}
          </Link>
        </nav>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {items.length === 0 && (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("categories.empty")}
          </p>
        )}
        {items.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            locale={locale}
            viewerVoted={votedIds.has(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Home chip strip**

In `src/app/[locale]/page.tsx`, import `listCategories` from `@/db/queries/categories`, fetch `const cats = await listCategories();` beside the feed, and render between the title/toggle row and the product list:

```tsx
<div className="mt-4 flex flex-wrap gap-2">
  {cats.map((c) => (
    <Link
      key={c.id}
      href={`/categories/${c.slug}`}
      className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
    >
      {locale === "id" ? c.nameId : c.nameEn}
    </Link>
  ))}
</div>
```

- [ ] **Step 4: Linkify the detail-page chips**

In `src/app/[locale]/products/[slug]/page.tsx`, replace the category `<span>` chips with locale-aware links (import `Link` from `@/i18n/navigation` — check if already imported):

```tsx
{categories.map((c) => (
  <Link
    key={c.slug}
    href={`/categories/${c.slug}`}
    className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
  >
    {locale === "id" ? c.nameId : c.nameEn}
  </Link>
))}
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds (`/[locale]/categories/[slug]` in the route list).

```bash
git add -A
git commit -m "feat: add category pages and linked category chips"
```

---

### Task 4: Search

**Files:**
- Create: `src/components/SearchForm.tsx`
- Create: `src/app/[locale]/search/page.tsx`
- Modify: `src/components/Header.tsx` (add the form)
- Modify: `messages/en.json`, `messages/id.json`
- Test: `src/components/SearchForm.test.tsx`

**Interfaces:**
- Consumes: `searchProducts` (Task 2), `useRouter` from `src/i18n/navigation.ts`, `ProductCard`, `getVotedProductIds`.
- Produces: route `/{locale}/search?q=…`; `SearchForm({ initialQuery? })` client component.

- [ ] **Step 1: i18n (both catalogs)**

`messages/en.json`:

```json
{
  "search": {
    "placeholder": "Search products…",
    "title": "Search results for \"{q}\"",
    "empty": "No products found.",
    "tooShort": "Type at least 2 characters to search."
  }
}
```

`messages/id.json`:

```json
{
  "search": {
    "placeholder": "Cari produk…",
    "title": "Hasil pencarian \"{q}\"",
    "empty": "Produk tidak ditemukan.",
    "tooShort": "Ketik minimal 2 karakter untuk mencari."
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: TDD the SearchForm render**

`src/components/SearchForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SearchForm } from "./SearchForm";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SearchForm", () => {
  it("renders a search input with the localized placeholder", () => {
    render(
      <NextIntlClientProvider
        locale="id"
        messages={{ search: { placeholder: "Cari produk…" } }}
      >
        <SearchForm />
      </NextIntlClientProvider>,
    );
    expect(screen.getByPlaceholderText("Cari produk…")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("prefills the initial query", () => {
    render(
      <NextIntlClientProvider
        locale="id"
        messages={{ search: { placeholder: "Cari produk…" } }}
      >
        <SearchForm initialQuery="kopi" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("kopi");
  });
});
```

Run → FAIL (module not found). Then implement `src/components/SearchForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export function SearchForm({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        className="w-36 rounded-md border border-gray-300 px-3 py-1 text-sm focus:w-56 focus:border-black focus:outline-none sm:w-48 sm:focus:w-64 transition-all"
      />
    </form>
  );
}
```

Run → PASS (2/2).

- [ ] **Step 3: Add to the Header**

In `src/components/Header.tsx`, import and render `<SearchForm />` between the flex spacer and the Submit link:

```tsx
<div className="flex-1" />
<SearchForm />
<Link href="/submit" ...>
```

- [ ] **Step 4: Search results page**

`src/app/[locale]/search/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { searchProducts } from "@/db/queries/discovery";
import { getVotedProductIds } from "@/db/queries/votes";
import { ProductCard } from "@/components/ProductCard";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q = "" } = await searchParams;
  const t = await getTranslations("search");
  const query = q.trim();

  const items = await searchProducts(query);
  const session = await auth();
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">{t("title", { q: query })}</h1>
      <div className="mt-6 flex flex-col gap-3">
        {query.length < 2 ? (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("tooShort")}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("empty")}
          </p>
        ) : (
          items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              locale={locale}
              viewerVoted={votedIds.has(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds.

```bash
git add -A
git commit -m "feat: add product search"
```

---

### Task 5: User profile pages

**Files:**
- Create: `src/app/[locale]/u/[username]/page.tsx`
- Modify: `src/components/ProductCard.tsx` (optional `showVote` prop, default true)
- Modify: `src/app/[locale]/products/[slug]/page.tsx` (maker name links to profile)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `getUserByUsername`/`listProductsByMaker`/`listVotedProducts`/`MakerProduct` (Task 2), `ProductDetail.makerUsername` (Task 2), `isAdmin`, `getVotedProductIds`, `getFormatter` from `next-intl/server`.
- Produces: route `/{locale}/u/{username}`; `ProductCard` accepts `showVote?: boolean`.

- [ ] **Step 1: i18n (both catalogs)**

`messages/en.json`:

```json
{
  "profile": {
    "joined": "Joined {date}",
    "submissions": "Products",
    "upvoted": "Upvoted",
    "noSubmissions": "No products launched yet.",
    "noUpvotes": "No upvotes yet.",
    "statusPending": "Under review",
    "statusRejected": "Rejected"
  }
}
```

`messages/id.json`:

```json
{
  "profile": {
    "joined": "Bergabung {date}",
    "submissions": "Produk",
    "upvoted": "Didukung",
    "noSubmissions": "Belum ada produk yang diluncurkan.",
    "noUpvotes": "Belum ada dukungan.",
    "statusPending": "Sedang ditinjau",
    "statusRejected": "Ditolak"
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: ProductCard showVote prop**

In `src/components/ProductCard.tsx`, extend the props with `showVote = true`:

```tsx
export async function ProductCard({
  item,
  locale,
  viewerVoted,
  showVote = true,
}: {
  item: FeedItem;
  locale: string;
  viewerVoted: boolean;
  showVote?: boolean;
}) {
```

and wrap the `<VoteButton …/>` render in `{showVote && ( … )}`.

- [ ] **Step 3: Profile page**

`src/app/[locale]/u/[username]/page.tsx`:

```tsx
import Image from "next/image";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import {
  getUserByUsername,
  listProductsByMaker,
  listVotedProducts,
  type MakerProduct,
} from "@/db/queries/users";
import { getVotedProductIds } from "@/db/queries/votes";
import { ProductCard } from "@/components/ProductCard";

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-800">
        {t("statusPending")}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
        {t("statusRejected")}
      </span>
    );
  }
  return null;
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  const profile = await getUserByUsername(username);
  if (!profile) notFound();

  const session = await auth();
  const isOwn = session?.user?.id === profile.id;
  const canSeeAll = isOwn || isAdmin(session);

  const t = await getTranslations("profile");
  const format = await getFormatter();

  const [submissions, upvoted] = await Promise.all([
    listProductsByMaker(profile.id, canSeeAll),
    listVotedProducts(profile.id),
  ]);

  const allIds = [...submissions, ...upvoted].map((p) => p.id);
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, allIds)
    : new Set<string>();

  const renderCard = (item: MakerProduct | (typeof upvoted)[number]) => {
    const status = "status" in item ? item.status : "approved";
    return (
      <div key={item.id} className="flex flex-col gap-1">
        {status !== "approved" && (
          <div>
            <StatusBadge status={status} t={t} />
          </div>
        )}
        <ProductCard
          item={item}
          locale={locale}
          viewerVoted={votedIds.has(item.id)}
          showVote={status === "approved"}
        />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center gap-4">
        {profile.image ? (
          <Image
            src={profile.image}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl font-bold text-gray-500">
            {(profile.name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{profile.name ?? profile.username}</h1>
          {profile.bio && <p className="text-gray-600">{profile.bio}</p>}
          <p className="text-sm text-gray-400">
            {t("joined", {
              date: format.dateTime(profile.createdAt, { dateStyle: "medium" }),
            })}
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">{t("submissions")}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {submissions.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
        ) : (
          submissions.map(renderCard)
        )}
      </div>

      <h2 className="mt-8 text-lg font-bold">{t("upvoted")}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {upvoted.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noUpvotes")}</p>
        ) : (
          upvoted.map(renderCard)
        )}
      </div>
    </div>
  );
}
```

Note: `profile.image` is typically a Google-hosted avatar (`lh3.googleusercontent.com`) — add that hostname to `next.config.ts` `images.remotePatterns`:

```ts
{ protocol: "https", hostname: "lh3.googleusercontent.com" },
```

- [ ] **Step 4: Maker link on the detail page**

In `src/app/[locale]/products/[slug]/page.tsx`, the maker line currently renders plain text. When `makerUsername` exists, wrap in a locale-aware Link:

```tsx
{makerName && (
  <p className="text-sm text-gray-400">
    {detail.makerUsername ? (
      <Link href={`/u/${detail.makerUsername}`} className="hover:underline">
        {t("by", { name: makerName })}
      </Link>
    ) : (
      t("by", { name: makerName })
    )}
  </p>
)}
```

(Adjust to the file's actual destructuring — `makerUsername` comes from the `ProductDetail` returned by `getProductBySlug`; destructure it alongside `makerName`.)

- [ ] **Step 5: Verify + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds (`/[locale]/u/[username]` in the route list).

```bash
git add -A
git commit -m "feat: add user profile pages"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Gates**

Run: `pnpm test` → all pass, pristine. `npx tsc --noEmit` → clean. `pnpm build` → succeeds.

- [ ] **Step 2: Manual smoke (requires OAuth creds)**

With `pnpm dev`: category chips navigate and filter; search from the header finds by name and tagline (try `%` literal); own profile shows pending submissions with badges, others' don't; upvoted section lists what you voted; maker link on a product page opens the maker's profile; all pages localized in both locales. If creds are still placeholders, record the smoke as deferred.

- [ ] **Step 3: Commit fixups if any**

```bash
git add -A
git commit -m "chore: phase 4 verification fixups"
```

---

## Self-Review

- **Spec coverage (Phase 4 scope):** category browsing (Task 3) ✓; search via ILIKE over name/tagline (Tasks 2, 4) ✓; profile pages with submissions + upvotes (Tasks 2, 5) ✓; the Phase-2 spec promise "maker sees 'Under review' in their profile" lands here via status badges on own profile (Task 5) ✓; username infrastructure the spec's data model assumed (Task 1) ✓.
- **Placeholder scan:** none; complete code in every step.
- **Type consistency:** `feedColumns`/`FeedItem`/`FeedSort` exported from products.ts and consumed by discovery.ts/users.ts; `MakerProduct = FeedItem & {status}` consumed by the profile page; `ProfileUser` consumed by the profile page; `assignUsername` consumed by auth event + backfill; `ProductDetail.makerUsername` consumed by the detail-page maker link; `showVote` prop added and used only where defined.
