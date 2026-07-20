# Phase 3: Community — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship community engagement: logged-in users upvote products (toggle, optimistic UI) and discuss them in one-level-threaded comment sections with soft delete.

**Architecture:** Same layering as Phase 2. Vote and comment mutations live in query functions (`src/db/queries/votes.ts`, `src/db/queries/comments.ts`) that run their read-check + write + denormalized-count update inside one `dbc.transaction(...)`, TDD'd on PGlite. Server actions compose session check → validation → query → `revalidatePath`. The vote button is a small client island with optimistic local state reconciled from the action's return value; comment forms use `useActionState`. Guests who try to vote or comment are routed into Google sign-in with a redirect back to where they were.

**Tech Stack:** Existing stack only — no new dependencies.

## Global Constraints

- Package manager: **pnpm**. TypeScript `strict: true`. Tailwind only — no inline `style={{}}`.
- Every user-facing string in BOTH `messages/id.json` and `messages/en.json` (parity test enforces). Validation errors are i18n keys.
- All mutations are server actions that re-check the session server-side. Admin-ness comes from `isAdmin(session)` (`src/auth-helpers.ts`).
- All DB access via query functions in `src/db/queries/*`, Drizzle core API, last param `dbc: DBClient = db`.
- **Votes and comments are only allowed on `approved` products** — enforced inside the query functions (transaction), not just in UI.
- **One level of comment threading** — a reply's parent must be a top-level comment of the same product; enforced in `createComment`.
- Denormalized `products.voteCount` / `products.commentCount` are updated in the SAME transaction as the vote/comment row change.
- Soft-deleted comment bodies must never reach the client — `listComments` scrubs `body` to `""` when `isDeleted`.
- Comment bodies render through `react-markdown` with raw HTML disabled (no rehype-raw) — same security property as product descriptions.

---

### Task 1: Votes query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/votes.ts`
- Test: `src/db/queries/votes.test.ts`

**Interfaces:**
- Consumes: `DBClient`/`db`, `products`/`votes` tables, test harness (`createTestDb`, `seedTestUser`), `createProduct`/`approveProduct` from `src/db/queries/products.ts` (as test fixtures).
- Produces:
  - `type VoteResult = { voted: boolean; voteCount: number }`
  - `toggleVote(productId: string, userId: string, dbc?): Promise<VoteResult | null>` — inserts the vote (respecting the unique index) or removes it, adjusting `products.voteCount` in the same transaction; returns `null` (and changes nothing) when the product doesn't exist or isn't `approved`.
  - `getVotedProductIds(userId: string, productIds: string[], dbc?): Promise<Set<string>>` — which of the given products this user has voted for; empty set for empty input.

- [ ] **Step 1: Write failing tests**

`src/db/queries/votes.test.ts`:

```ts
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
```

Run: `pnpm test src/db/queries/votes.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

`src/db/queries/votes.ts`:

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { products, votes } from "@/db/schema";

export type VoteResult = { voted: boolean; voteCount: number };

export async function toggleVote(
  productId: string,
  userId: string,
  dbc: DBClient = db,
): Promise<VoteResult | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;

    const inserted = await tx
      .insert(votes)
      .values({ productId, userId })
      .onConflictDoNothing()
      .returning({ id: votes.id });

    const voted = inserted.length > 0;
    if (!voted) {
      await tx
        .delete(votes)
        .where(and(eq(votes.productId, productId), eq(votes.userId, userId)));
    }

    const [updated] = await tx
      .update(products)
      .set({ voteCount: sql`${products.voteCount} + ${voted ? 1 : -1}` })
      .where(eq(products.id, productId))
      .returning({ voteCount: products.voteCount });

    return { voted, voteCount: updated.voteCount };
  });
}

export async function getVotedProductIds(
  userId: string,
  productIds: string[],
  dbc: DBClient = db,
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await dbc
    .select({ productId: votes.productId })
    .from(votes)
    .where(and(eq(votes.userId, userId), inArray(votes.productId, productIds)));
  return new Set(rows.map((r) => r.productId));
}
```

- [ ] **Step 3: Run, verify pass**

Run: `pnpm test src/db/queries/votes.test.ts` → Expected: PASS (all 7).

- [ ] **Step 4: Full suite + commit**

Run: `pnpm test` → all pass, pristine.

```bash
git add -A
git commit -m "feat: add votes query layer"
```

---

### Task 2: Vote action + VoteButton, wired into feed and detail

**Files:**
- Create: `src/app/actions/vote.ts`
- Create: `src/components/VoteButton.tsx`
- Modify: `src/components/ProductCard.tsx` (VoteButton replaces the static pill; button must NOT sit inside the Link)
- Modify: `src/app/[locale]/page.tsx` (fetch viewer's voted set)
- Modify: `src/app/[locale]/products/[slug]/page.tsx` (VoteButton near the title)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `toggleVote`/`getVotedProductIds`/`VoteResult` (Task 1), `auth`/`signIn` from `src/auth.ts`, `usePathname` from `src/i18n/navigation.ts`.
- Produces:
  - Server action `voteAction(productId: string, currentPath: string): Promise<VoteResult | null>` — guests get redirected into Google sign-in with `redirectTo` back to `currentPath`.
  - `VoteButton({ productId, initialCount, initialVoted, size? }: { productId: string; initialCount: number; initialVoted: boolean; size?: "sm" | "lg" })` client component with optimistic toggle.

- [ ] **Step 1: i18n strings (both catalogs)**

Merge into `messages/en.json`:

```json
{ "vote": { "label": "Upvote", "voted": "Upvoted" } }
```

Merge into `messages/id.json`:

```json
{ "vote": { "label": "Dukung", "voted": "Didukung" } }
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 2: The server action**

`src/app/actions/vote.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { toggleVote, type VoteResult } from "@/db/queries/votes";

export async function voteAction(
  productId: string,
  currentPath: string,
): Promise<VoteResult | null> {
  const session = await auth();
  if (!session?.user) {
    const locale = await getLocale();
    // Guests are prompted to sign in, then land back where they were.
    await signIn("google", { redirectTo: `/${locale}${currentPath}` });
    return null; // unreachable — signIn redirects — but satisfies the type
  }
  const result = await toggleVote(productId, session.user.id);
  revalidatePath("/", "layout");
  return result;
}
```

- [ ] **Step 3: The VoteButton client component**

`src/components/VoteButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { voteAction } from "@/app/actions/vote";

export function VoteButton({
  productId,
  initialCount,
  initialVoted,
  size = "sm",
}: {
  productId: string;
  initialCount: number;
  initialVoted: boolean;
  size?: "sm" | "lg";
}) {
  const t = useTranslations("vote");
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(initialVoted);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    const prev = { count, voted };
    // Optimistic flip; reconciled (or reverted) from the action result.
    setVoted(!prev.voted);
    setCount(prev.count + (prev.voted ? -1 : 1));
    startTransition(async () => {
      const result = await voteAction(productId, pathname);
      if (result) {
        setVoted(result.voted);
        setCount(result.voteCount);
      } else {
        setVoted(prev.voted);
        setCount(prev.count);
      }
    });
  }

  const base =
    "flex flex-col items-center rounded-md border font-medium transition-colors";
  const sizing = size === "lg" ? "px-4 py-2 text-base" : "px-3 py-1 text-sm";
  const tone = voted
    ? "border-black bg-black text-white"
    : "border-gray-200 text-gray-700 hover:border-gray-400";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={voted}
      aria-label={voted ? t("voted") : t("label")}
      className={`${base} ${sizing} ${tone} disabled:opacity-60`}
    >
      <span aria-hidden="true">▲</span>
      <span>{count}</span>
    </button>
  );
}
```

- [ ] **Step 4: Rewire ProductCard (button outside the Link)**

Replace `src/components/ProductCard.tsx`:

```tsx
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/lib/locale-content";
import type { FeedItem } from "@/db/queries/products";
import { VoteButton } from "./VoteButton";

export async function ProductCard({
  item,
  locale,
  viewerVoted,
}: {
  item: FeedItem;
  locale: string;
  viewerVoted: boolean;
}) {
  const t = await getTranslations("feed");
  const { tagline } = pickLocalized(
    { ...item, descriptionId: null, descriptionEn: null },
    locale,
  );

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 hover:border-gray-400">
      <Link
        href={`/products/${item.slug}`}
        className="flex min-w-0 flex-1 items-center gap-4"
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
          {tagline && (
            <p className="truncate text-sm text-gray-600">{tagline}</p>
          )}
          {item.makerName && (
            <p className="text-xs text-gray-400">
              {t("by", { name: item.makerName })}
            </p>
          )}
        </div>
      </Link>
      <VoteButton
        productId={item.id}
        initialCount={item.voteCount}
        initialVoted={viewerVoted}
      />
    </div>
  );
}
```

- [ ] **Step 5: Feed page fetches the viewer's voted set**

In `src/app/[locale]/page.tsx`, add imports (`auth` from `@/auth`, `getVotedProductIds` from `@/db/queries/votes`) and, after `const items = await listFeed(sort);`:

```tsx
const session = await auth();
const votedIds = session?.user
  ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
  : new Set<string>();
```

and pass it down:

```tsx
<ProductCard
  key={item.id}
  item={item}
  locale={locale}
  viewerVoted={votedIds.has(item.id)}
/>
```

- [ ] **Step 6: Detail page gets a VoteButton**

In `src/app/[locale]/products/[slug]/page.tsx` (session is already fetched for the visibility gate), add imports (`getVotedProductIds` from `@/db/queries/votes`, `VoteButton` from `@/components/VoteButton`), compute after the gate:

```tsx
const votedIds = session?.user
  ? await getVotedProductIds(session.user.id, [product.id])
  : new Set<string>();
```

and render the button inside the existing title row (`<div className="flex items-center gap-4">`), after the name/tagline block:

```tsx
<div className="ml-auto">
  <VoteButton
    productId={product.id}
    initialCount={product.voteCount}
    initialVoted={votedIds.has(product.id)}
    size="lg"
  />
</div>
```

(The "Visit website" link keeps its `ml-auto` row below — remove the now-duplicated `ml-auto` from the link's className if the layout doubles up; the button owns the title row's right edge.)

- [ ] **Step 7: Verify + commit**

Run: `pnpm test` → all pass. `npx tsc --noEmit` → clean. `pnpm build` → succeeds.
Manual smoke (optional, needs OAuth): click ▲ as guest → Google sign-in; as user → count flips instantly, persists on reload.

```bash
git add -A
git commit -m "feat: add upvoting with optimistic vote button"
```

---

### Task 3: Comments query layer (TDD on PGlite)

**Files:**
- Create: `src/db/queries/comments.ts`
- Test: `src/db/queries/comments.test.ts`

**Interfaces:**
- Consumes: `DBClient`/`db`, `comments`/`products`/`users` tables, test harness, products queries as fixtures.
- Produces:
  - `type CommentItem = { id: string; parentId: string | null; body: string; isDeleted: boolean; createdAt: Date; authorId: string; authorName: string | null; authorImage: string | null }`
  - `createComment(data: { productId: string; userId: string; body: string; parentId?: string }, dbc?): Promise<{ id: string } | null>` — `null` (no writes) when the product isn't approved, or the parent is missing / belongs to another product / is itself a reply (one-level rule). Increments `commentCount` in the same transaction.
  - `listComments(productId: string, dbc?): Promise<CommentItem[]>` — `createdAt` ascending, author joined; **`body` scrubbed to `""` for soft-deleted rows**.
  - `softDeleteComment(commentId: string, requesterId: string, requesterIsAdmin: boolean, dbc?): Promise<boolean>` — only the author or an admin; false if missing/already deleted/unauthorized; decrements `commentCount` in the same transaction.

- [ ] **Step 1: Write failing tests**

`src/db/queries/comments.test.ts`:

```ts
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
```

Run: `pnpm test src/db/queries/comments.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

`src/db/queries/comments.ts`:

```ts
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { comments, products, users } from "@/db/schema";

export type CommentItem = {
  id: string;
  parentId: string | null;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
};

export async function createComment(
  data: { productId: string; userId: string; body: string; parentId?: string },
  dbc: DBClient = db,
): Promise<{ id: string } | null> {
  return dbc.transaction(async (tx) => {
    const [product] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, data.productId))
      .limit(1);
    if (!product || product.status !== "approved") return null;

    if (data.parentId) {
      const [parent] = await tx
        .select({
          productId: comments.productId,
          parentId: comments.parentId,
        })
        .from(comments)
        .where(eq(comments.id, data.parentId))
        .limit(1);
      // One-level threading: parent must exist, on the same product,
      // and itself be a top-level comment.
      if (
        !parent ||
        parent.productId !== data.productId ||
        parent.parentId !== null
      ) {
        return null;
      }
    }

    const [row] = await tx
      .insert(comments)
      .values({
        productId: data.productId,
        userId: data.userId,
        body: data.body,
        parentId: data.parentId ?? null,
      })
      .returning({ id: comments.id });

    await tx
      .update(products)
      .set({ commentCount: sql`${products.commentCount} + 1` })
      .where(eq(products.id, data.productId));

    return row;
  });
}

export async function listComments(
  productId: string,
  dbc: DBClient = db,
): Promise<CommentItem[]> {
  const rows = await dbc
    .select({
      id: comments.id,
      parentId: comments.parentId,
      body: comments.body,
      isDeleted: comments.isDeleted,
      createdAt: comments.createdAt,
      authorId: comments.userId,
      authorName: users.name,
      authorImage: users.image,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.productId, productId))
    .orderBy(asc(comments.createdAt));
  // Soft-deleted bodies must never reach the client.
  return rows.map((r) => (r.isDeleted ? { ...r, body: "" } : r));
}

export async function softDeleteComment(
  commentId: string,
  requesterId: string,
  requesterIsAdmin: boolean,
  dbc: DBClient = db,
): Promise<boolean> {
  return dbc.transaction(async (tx) => {
    const [c] = await tx
      .select({
        userId: comments.userId,
        productId: comments.productId,
        isDeleted: comments.isDeleted,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!c || c.isDeleted) return false;
    if (c.userId !== requesterId && !requesterIsAdmin) return false;

    await tx
      .update(comments)
      .set({ isDeleted: true })
      .where(eq(comments.id, commentId));
    await tx
      .update(products)
      .set({ commentCount: sql`${products.commentCount} - 1` })
      .where(eq(products.id, c.productId));
    return true;
  });
}
```

- [ ] **Step 3: Run, verify pass**

Run: `pnpm test src/db/queries/comments.test.ts` → Expected: PASS (all 10).

- [ ] **Step 4: Full suite + commit**

Run: `pnpm test` → all pass, pristine.

```bash
git add -A
git commit -m "feat: add comments query layer"
```

---

### Task 4: Comment validation, actions, and CommentSection UI

**Files:**
- Modify: `src/lib/validation.ts` (add comment schema + parser)
- Test: `src/lib/validation.test.ts` (extend)
- Create: `src/app/[locale]/products/[slug]/actions.ts`
- Create: `src/components/CommentSection.tsx`
- Create: `src/components/CommentForm.tsx`
- Modify: `src/app/[locale]/products/[slug]/page.tsx` (render the section)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `createComment`/`listComments`/`softDeleteComment`/`CommentItem` (Task 3), `auth`/`signIn`, `isAdmin`, `react-markdown`.
- Produces:
  - `parseCommentForm(formData: FormData): { ok: true; data: { body: string } } | { ok: false; errors: Record<string, string> }` from `src/lib/validation.ts`.
  - Server actions in `products/[slug]/actions.ts`: `addCommentAction(prev: CommentState, formData: FormData): Promise<CommentState>` with `CommentState = { ok: boolean; errors: Record<string, string> }`, and `deleteCommentAction(formData: FormData): Promise<void>`.
  - `CommentSection({ productId, slug, comments, viewerId, viewerIsAdmin, isAuthenticated })` server component; `CommentForm({ productId, slug, parentId? })` client component (`useActionState`, resets on success).

- [ ] **Step 1: TDD the comment validation**

Add to `src/lib/validation.test.ts`:

```ts
import { parseCommentForm } from "./validation";

describe("parseCommentForm", () => {
  it("accepts a normal body and trims it", () => {
    const fd = new FormData();
    fd.append("body", "  Mantap!  ");
    const r = parseCommentForm(fd);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.body).toBe("Mantap!");
  });

  it("rejects an empty body", () => {
    const fd = new FormData();
    fd.append("body", "   ");
    const r = parseCommentForm(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBe("validation.commentRequired");
  });

  it("rejects a missing body", () => {
    const r = parseCommentForm(new FormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBe("validation.commentRequired");
  });

  it("rejects an over-long body", () => {
    const fd = new FormData();
    fd.append("body", "x".repeat(2001));
    const r = parseCommentForm(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBe("validation.commentTooLong");
  });
});
```

Run → FAIL (parseCommentForm not exported). Then add to `src/lib/validation.ts`:

```ts
export const commentInputSchema = z.object({
  body: z
    .string("validation.commentRequired")
    .trim()
    .min(1, "validation.commentRequired")
    .max(2000, "validation.commentTooLong"),
});

export function parseCommentForm(
  formData: FormData,
):
  | { ok: true; data: { body: string } }
  | { ok: false; errors: Record<string, string> } {
  const result = commentInputSchema.safeParse({
    body: formData.get("body") ?? undefined,
  });
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
```

Run → PASS.

- [ ] **Step 2: i18n strings (both catalogs)**

Merge into `messages/en.json` — a new top-level `comments` object, plus two new keys added INSIDE the existing `validation` object:

```json
{
  "comments": {
    "title": "Comments ({count})",
    "empty": "No comments yet. Start the discussion!",
    "placeholder": "Write a comment (markdown supported)…",
    "send": "Comment",
    "reply": "Reply",
    "delete": "Delete",
    "deleted": "Comment deleted",
    "signInToComment": "Sign in to join the discussion."
  }
}
```

```json
{
  "validation": {
    "commentRequired": "Comment cannot be empty.",
    "commentTooLong": "Comment is too long (max 2000 characters)."
  }
}
```

Merge into `messages/id.json` (same shape):

```json
{
  "comments": {
    "title": "Komentar ({count})",
    "empty": "Belum ada komentar. Mulai diskusinya!",
    "placeholder": "Tulis komentar (mendukung markdown)…",
    "send": "Komentari",
    "reply": "Balas",
    "delete": "Hapus",
    "deleted": "Komentar dihapus",
    "signInToComment": "Masuk untuk ikut berdiskusi."
  },
  "validation": {
    "commentRequired": "Komentar tidak boleh kosong.",
    "commentTooLong": "Komentar terlalu panjang (maksimal 2000 karakter)."
  }
}
```

Run: `pnpm test src/i18n/messages.test.ts` → PASS.

- [ ] **Step 3: The server actions**

`src/app/[locale]/products/[slug]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { parseCommentForm } from "@/lib/validation";
import { createComment, softDeleteComment } from "@/db/queries/comments";

export type CommentState = { ok: boolean; errors: Record<string, string> };

export async function addCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const session = await auth();
  const slug = String(formData.get("slug") ?? "");
  if (!session?.user) {
    const locale = await getLocale();
    await signIn("google", { redirectTo: `/${locale}/products/${slug}` });
    return { ok: false, errors: {} }; // unreachable — signIn redirects
  }

  const parsed = parseCommentForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const productId = String(formData.get("productId") ?? "");
  const parentIdRaw = String(formData.get("parentId") ?? "");
  const created = await createComment({
    productId,
    userId: session.user.id,
    body: parsed.data.body,
    parentId: parentIdRaw || undefined,
  });
  if (!created) return { ok: false, errors: { body: "validation.formError" } };

  revalidatePath("/", "layout");
  return { ok: true, errors: {} };
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const commentId = String(formData.get("commentId") ?? "");
  if (!commentId) return;
  await softDeleteComment(commentId, session.user.id, isAdmin(session));
  revalidatePath("/", "layout");
}
```

- [ ] **Step 4: The CommentForm client component**

`src/components/CommentForm.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  addCommentAction,
  type CommentState,
} from "@/app/[locale]/products/[slug]/actions";

const initialState: CommentState = { ok: false, errors: {} };

export function CommentForm({
  productId,
  slug,
  parentId,
}: {
  productId: string;
  slug: string;
  parentId?: string;
}) {
  const t = useTranslations();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    addCommentAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="body"
        rows={parentId ? 2 : 3}
        placeholder={t("comments.placeholder")}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
      />
      {state.errors.body && (
        <p className="text-sm text-red-600">{t(state.errors.body)}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {parentId ? t("comments.reply") : t("comments.send")}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: The CommentSection server component**

`src/components/CommentSection.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import type { CommentItem } from "@/db/queries/comments";
import { deleteCommentAction } from "@/app/[locale]/products/[slug]/actions";
import { CommentForm } from "./CommentForm";

function Avatar({ name }: { name: string | null }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
      {(name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}

async function Comment({
  comment,
  canDelete,
  children,
}: {
  comment: CommentItem;
  canDelete: boolean;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("comments");
  return (
    <div className="flex gap-3">
      <Avatar name={comment.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">
            {comment.authorName ?? "?"}
          </span>
          <span className="text-xs text-gray-400">
            {comment.createdAt.toLocaleDateString()}
          </span>
          {canDelete && !comment.isDeleted && (
            <form action={deleteCommentAction} className="ml-auto">
              <input type="hidden" name="commentId" value={comment.id} />
              <button
                type="submit"
                className="text-xs text-gray-400 hover:text-red-600"
              >
                {t("delete")}
              </button>
            </form>
          )}
        </div>
        {comment.isDeleted ? (
          <p className="text-sm italic text-gray-400">{t("deleted")}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{comment.body}</ReactMarkdown>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export async function CommentSection({
  productId,
  slug,
  comments,
  viewerId,
  viewerIsAdmin,
  isAuthenticated,
}: {
  productId: string;
  slug: string;
  comments: CommentItem[];
  viewerId: string | null;
  viewerIsAdmin: boolean;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("comments");
  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesFor = (id: string) =>
    comments.filter((c) => c.parentId === id);
  const canDelete = (c: CommentItem) =>
    viewerIsAdmin || (viewerId !== null && viewerId === c.authorId);

  return (
    <section className="mt-10 border-t border-gray-200 pt-6">
      <h2 className="text-lg font-bold">
        {t("title", { count: comments.filter((c) => !c.isDeleted).length })}
      </h2>

      <div className="mt-4">
        {isAuthenticated ? (
          <CommentForm productId={productId} slug={slug} />
        ) : (
          <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-500">
            {t("signInToComment")}
          </p>
        )}
      </div>

      {topLevel.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">{t("empty")}</p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {topLevel.map((c) => (
          <Comment key={c.id} comment={c} canDelete={canDelete(c)}>
            <div className="mt-3 flex flex-col gap-4 border-l-2 border-gray-100 pl-4">
              {repliesFor(c.id).map((r) => (
                <Comment key={r.id} comment={r} canDelete={canDelete(r)} />
              ))}
              {isAuthenticated && !c.isDeleted && (
                <CommentForm productId={productId} slug={slug} parentId={c.id} />
              )}
            </div>
          </Comment>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Render it on the detail page**

In `src/app/[locale]/products/[slug]/page.tsx`, add imports (`listComments` from `@/db/queries/comments`, `CommentSection` from `@/components/CommentSection`), fetch after the visibility gate:

```tsx
const productComments =
  product.status === "approved" ? await listComments(product.id) : [];
```

and render at the end of the `<article>`, only for approved products (pending/rejected products can't be commented on anyway):

```tsx
{product.status === "approved" && (
  <CommentSection
    productId={product.id}
    slug={product.slug}
    comments={productComments}
    viewerId={session?.user?.id ?? null}
    viewerIsAdmin={viewerIsAdmin}
    isAuthenticated={!!session?.user}
  />
)}
```

- [ ] **Step 7: Verify + commit**

Run: `pnpm test` → all pass, pristine. `npx tsc --noEmit` → clean. `pnpm build` → succeeds.

```bash
git add -A
git commit -m "feat: add comment sections with replies and soft delete"
```

---

### Task 5: Final verification

**Files:** none (verification only; ledger updates).

- [ ] **Step 1: Gates**

Run: `pnpm test` → all suites pass, pristine. `npx tsc --noEmit` → clean. `pnpm build` → succeeds.

- [ ] **Step 2: Manual end-to-end smoke (requires OAuth creds in .env.local)**

With `pnpm dev`:
1. As guest: click ▲ on a feed card → Google sign-in → land back on the feed.
2. Signed in: toggle a vote — count flips instantly, survives reload; toggle off works.
3. On a product page: post a comment (markdown, e.g. `**tebal**`) → renders bold; reply to it; nested reply form does not appear under replies.
4. Delete your own comment → shows "Comment deleted" placeholder; count in the heading drops.
5. As admin: delete someone else's comment → works.
6. Switch locale to EN → vote/comment UI localized.

If OAuth creds are still placeholders, record the smoke as deferred rather than skipping silently.

- [ ] **Step 3: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "chore: phase 3 verification fixups"
```

---

## Self-Review

- **Spec coverage (Phase 3 scope):** upvote toggle with unique-constraint + same-transaction count (Task 1) ✓; optimistic UI + guest sign-in prompt (Task 2) ✓; comments with markdown, one-level replies, same-transaction count (Tasks 3–4) ✓; soft delete by author or admin, no orphaned replies, scrubbed bodies (Tasks 3–4) ✓; approved-only enforcement in the query layer (Tasks 1, 3) ✓; bilingual UI (Tasks 2, 4) ✓; `feed.votes`… the existing unused key stays unused (VoteButton shows the raw count in the button — consistent with Product Hunt's pill); acceptable.
- **Placeholder scan:** none; every code step is complete.
- **Type consistency:** `VoteResult` produced in Task 1, consumed by Task 2's action/button; `CommentItem` produced in Task 3, consumed by Task 4's section; `CommentState = { ok, errors }` consistent between action and form; `parseCommentForm` name/shape matches between validation and action; `viewerIsAdmin` sourced from the detail page's existing `isAdmin(session)` computation.
