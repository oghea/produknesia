# Phase 6: Launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a coming-soon gate + story landing (hiding the catalog while invitations seed it), a daily-digest homepage with cursor pagination for 100+ products, and the launch-announce tooling.

**Architecture:** A `LAUNCH_MODE=coming_soon` env flag read by `isComingSoon()`; gated pages check it server-side (admins bypass; claim/submit/product/unwatch stay open). The homepage renders the landing pre-launch and a WIB-grouped daily digest post-launch. Pagination is keyset (`launchedAt desc, id desc` compound cursor) served by a server action; `ProductCard` becomes a universal (non-async, `useTranslations`) component so the client "Muat lagi" list can render it. Waitlist is one table + one guarded insert.

**Tech Stack:** Existing stack only — no new dependencies.

## Global Constraints

- pnpm; TS strict; Tailwind semantic tokens; flat buttons; Base UI conventions (`render`, `nativeButton={false}`); every user-facing string in BOTH catalogs (parity test); errors as i18n keys; `localePath()` for action redirects; PGlite tests only; `.returning()`-guarded conditional writes; timestamptz.
- Gate rules exactly per spec §1's route table: gated = home feed, categories, search, profiles; open = product detail, submit, updates/new, claim, unwatch, admin. Admins (`isAdmin(session)`) bypass everywhere. Gate enforced in pages, NOT middleware.
- Waitlist: email lowercased+trimmed, unique, `onConflictDoNothing`; identical success response for new/duplicate (no enumeration).
- Day grouping uses **Asia/Jakarta**, never server-local time; `groupByLaunchDay` is pure with an injectable `now`.
- Feed page size **30**; cursor = `${launchedAt.toISOString()}_${id}`; keyset predicate `(launchedAt, id) < (cursorDate, cursorId)`.
- The landing may use one oversized display moment (hero up to `text-6xl`); everything else stays in the existing scale.
- `LAUNCH_MODE` documented in `.env.example`; never set in `.env.local` by tasks (controller/user flips it in Vercel).

---

### Task 1: Waitlist table + queries (TDD)

**Files:**
- Modify: `src/db/schema.ts` (add `launchSubscribers`)
- Modify: `src/db/schema.test.ts` (extend)
- Create: `src/db/queries/waitlist.ts`
- Test: `src/db/queries/waitlist.test.ts`
- Modify: `.env.example` (document `LAUNCH_MODE`)

**Interfaces:**
- Produces: `launchSubscribers` table; `addSubscriber(email: string, dbc?): Promise<{ added: boolean }>` (lowercases+trims internally); `listSubscriberEmails(dbc?): Promise<string[]>`.

- [ ] **Step 1: Failing schema test**

Append to `src/db/schema.test.ts` (extend the schema import with `launchSubscribers`):

```ts
it("launchSubscribers has a unique email", () => {
  const cols = Object.keys(getTableColumns(launchSubscribers));
  expect(cols).toEqual(expect.arrayContaining(["id", "email", "createdAt"]));
});
```

Run: `pnpm test src/db/schema.test.ts` → FAIL (not exported).

- [ ] **Step 2: Add the table**

Append to `src/db/schema.ts`:

```ts
export const launchSubscribers = pgTable("launch_subscribers", {
  id: id(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
```

Run schema test → PASS. Then `pnpm db:generate` (new `drizzle/0002_*.sql`; 0000/0001 untouched) and `pnpm db:migrate` (live dev Neon).

- [ ] **Step 3: Failing waitlist query tests**

`src/db/queries/waitlist.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { addSubscriber, listSubscriberEmails } from "./waitlist";

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
});

describe("addSubscriber", () => {
  it("adds a normalized email", async () => {
    const r = await addSubscriber("  Budi@Example.COM ", db);
    expect(r).toEqual({ added: true });
    expect(await listSubscriberEmails(db)).toEqual(["budi@example.com"]);
  });

  it("dedupes silently", async () => {
    await addSubscriber("a@b.co", db);
    const r = await addSubscriber("A@B.CO", db);
    expect(r).toEqual({ added: false });
    expect(await listSubscriberEmails(db)).toHaveLength(1);
  });
});
```

Run → FAIL (module not found).

- [ ] **Step 4: Implement `src/db/queries/waitlist.ts`**

```ts
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { launchSubscribers } from "@/db/schema";

export async function addSubscriber(
  email: string,
  dbc: DBClient = db,
): Promise<{ added: boolean }> {
  const rows = await dbc
    .insert(launchSubscribers)
    .values({ email: email.trim().toLowerCase() })
    .onConflictDoNothing()
    .returning({ id: launchSubscribers.id });
  return { added: rows.length > 0 };
}

export async function listSubscriberEmails(
  dbc: DBClient = db,
): Promise<string[]> {
  const rows = await dbc
    .select({ email: launchSubscribers.email })
    .from(launchSubscribers);
  return rows.map((r) => r.email);
}
```

Run → PASS (2/2).

- [ ] **Step 5: Document the flag**

Append to `.env.example`:

```
# Set to "coming_soon" to gate the catalog behind the story landing.
LAUNCH_MODE=""
```

- [ ] **Step 6: Full suite + commit**

`pnpm test` all pass.

```bash
git add -A
git commit -m "feat: add launch_subscribers table and waitlist queries"
```

---

### Task 2: isComingSoon + route gating + header variant

**Files:**
- Create: `src/lib/launch.ts`
- Test: `src/lib/launch.test.ts`
- Modify: `src/app/[locale]/categories/[slug]/page.tsx`, `src/app/[locale]/search/page.tsx`, `src/app/[locale]/u/[username]/page.tsx` (gate)
- Modify: `src/components/Header.tsx` (hide search pre-launch for non-admins)

**Interfaces:**
- Produces: `isComingSoon(): boolean` from `src/lib/launch.ts`. (The homepage branch lands in Task 3 with the Landing component.)
- Consumes: `isAdmin`, `auth`, `localePath`.

- [ ] **Step 1: TDD the flag helper**

`src/lib/launch.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { isComingSoon } from "./launch";

afterEach(() => {
  delete process.env.LAUNCH_MODE;
});

describe("isComingSoon", () => {
  it("is true only for the exact coming_soon value", () => {
    process.env.LAUNCH_MODE = "coming_soon";
    expect(isComingSoon()).toBe(true);
    process.env.LAUNCH_MODE = "live";
    expect(isComingSoon()).toBe(false);
    delete process.env.LAUNCH_MODE;
    expect(isComingSoon()).toBe(false);
  });
});
```

Run → FAIL. Implement `src/lib/launch.ts`:

```ts
/** Pre-launch gate: catalog hidden behind the story landing. */
export function isComingSoon(): boolean {
  return process.env.LAUNCH_MODE === "coming_soon";
}
```

Run → PASS.

- [ ] **Step 2: Gate categories/search/profile pages**

Each gated page fetches the session FIRST, gates, then does its data work.
Pattern (adapt each page's existing code; imports: `isComingSoon` from
`@/lib/launch`, `redirect` from `next/navigation`, `localePath` — some
already present):

`categories/[slug]/page.tsx` — replace the current post-notFound parallel
block's session handling:

```tsx
const session = await auth();
if (isComingSoon() && !isAdmin(session)) redirect(localePath(locale, "/"));

const category = await getCategory(slug);
if (!category) notFound();

const [t, items] = await Promise.all([
  getTranslations(),
  listProductsByCategory(category.id, sort),
]);
```

(`isAdmin` needs importing there.) `search/page.tsx` — same shape:

```tsx
const session = await auth();
if (isComingSoon() && !isAdmin(session)) redirect(localePath(locale, "/"));

const items = await searchProducts(query);
```

`u/[username]/page.tsx` — session is already fetched in a `Promise.all`
with the profile; split it:

```tsx
const session = await auth();
if (isComingSoon() && !isAdmin(session)) redirect(localePath(locale, "/"));

const profile = await getProfile(username);
if (!profile) notFound();
```

- [ ] **Step 3: Header variant**

In `src/components/Header.tsx` (server component): fetch the session once
and hide the search box pre-launch for non-admins:

```tsx
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { isComingSoon } from "@/lib/launch";
// inside Header():
const session = await auth();
const hideCatalog = isComingSoon() && !isAdmin(session);
// in JSX, wrap the search form:
{!hideCatalog && <SearchForm />}
```

(`auth()` is already called by `AuthButtons` in the same tree — Next dedupes
cookies-based `auth()` within a request via React cache; no extra DB hit.)

- [ ] **Step 4: Gates + commit**

`pnpm test` all pass; `npx tsc --noEmit` clean; `pnpm build` succeeds.
Manual: with `LAUNCH_MODE=coming_soon pnpm dev`, `/search` redirects to `/`
as guest; still works signed in as admin.

```bash
git add -A
git commit -m "feat: add coming-soon flag and catalog route gating"
```

---

### Task 3: Story landing + waitlist action + homepage branch

**Files:**
- Modify: `src/lib/validation.ts` + `src/lib/validation.test.ts` (email parse)
- Create: `src/app/actions/waitlist.ts`
- Create: `src/components/Landing.tsx`
- Create: `src/components/WaitlistForm.tsx`
- Modify: `src/db/queries/products.ts` (+ `countApprovedProducts`) and `src/db/queries/products.test.ts`
- Modify: `src/app/[locale]/page.tsx` (landing branch)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Produces: `parseWaitlistForm(formData): { ok: true; email: string } | { ok: false; errors: Record<string, string> }`; `joinWaitlistAction(prev: WaitlistState, fd: FormData): Promise<WaitlistState>` with `WaitlistState = { ok: boolean; errors: Record<string, string> }`; `countApprovedProducts(dbc?): Promise<number>`; `Landing({ locale })` server component.

- [ ] **Step 1: TDD email validation**

Append to `src/lib/validation.test.ts`:

```ts
import { parseWaitlistForm } from "./validation";

describe("parseWaitlistForm", () => {
  function wf(email?: string): FormData {
    const fd = new FormData();
    if (email !== undefined) fd.append("email", email);
    return fd;
  }

  it("accepts and normalizes a valid email", () => {
    const r = parseWaitlistForm(wf("  Budi@Example.COM "));
    expect(r).toEqual({ ok: true, email: "budi@example.com" });
  });

  it("rejects invalid and missing emails with an i18n key", () => {
    for (const fd of [wf("not-an-email"), wf("")]) {
      const r = parseWaitlistForm(fd);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.email).toBe("validation.emailInvalid");
    }
    const r = parseWaitlistForm(wf());
    expect(r.ok).toBe(false);
  });
});
```

Run → FAIL. Implement in `src/lib/validation.ts`:

```ts
const waitlistSchema = z.object({
  email: z
    .string("validation.emailInvalid")
    .trim()
    .toLowerCase()
    .email("validation.emailInvalid")
    .max(200, "validation.emailInvalid"),
});

export function parseWaitlistForm(
  formData: FormData,
): { ok: true; email: string } | { ok: false; errors: Record<string, string> } {
  const result = waitlistSchema.safeParse({
    email: formData.get("email") ?? undefined,
  });
  if (result.success) return { ok: true, email: result.data.email };
  return { ok: false, errors: { email: "validation.emailInvalid" } };
}
```

(zod v4: if `.email()` on a string chain warns as deprecated, use
`z.email("validation.emailInvalid")` at top level with `.trim().toLowerCase()`
via `.transform` — behavior identical; note the deviation.) Run → PASS.

- [ ] **Step 2: TDD countApprovedProducts**

Append to `src/db/queries/products.test.ts` (inside the existing setup):

```ts
describe("countApprovedProducts", () => {
  it("counts only approved products", async () => {
    const a = await createProduct(newProduct({ name: "Live One" }), db);
    await createProduct(newProduct({ name: "Pending One" }), db);
    await approveProduct(a.id, db);
    expect(await countApprovedProducts(db)).toBe(1);
  });
});
```

(Extend the test file's import from `./products` with `countApprovedProducts`;
`approveProduct` is already imported there.) Run → FAIL. Implement in
`src/db/queries/products.ts`:

```ts
export async function countApprovedProducts(
  dbc: DBClient = db,
): Promise<number> {
  const [row] = await dbc
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.status, "approved"));
  return row.n;
}
```

Run → PASS.

- [ ] **Step 3: i18n (both catalogs; parity green)**

`messages/en.json` — new top-level `landing` + one `validation` key:

```json
{
  "landing": {
    "badge": "Launching soon",
    "headline": "The stage for Indonesian products.",
    "beat1": "Every week, Indonesian developers and founders launch remarkable products — then drown on global platforms that weren't built for us. Wrong timezone, wrong language, wrong audience.",
    "beat2": "Produknesia is the stage where Indonesian products launch first: discovered, upvoted, and discussed by their own community.",
    "beat3": "We're opening the stage with the first 100+ products. Be the first to know — or be one of the makers on it.",
    "emailPlaceholder": "you@email.com",
    "joinWaitlist": "Join the waitlist",
    "joined": "You're on the list! See you on launch day.",
    "alreadyIn": "You're already in — see you on launch day.",
    "or": "or",
    "signInGoogle": "Sign in with Google",
    "makerCta": "Have a product? Submit it now →",
    "proof": "{count} products are getting ready for launch"
  },
  "validation": { "emailInvalid": "Enter a valid email address." }
}
```

`messages/id.json`:

```json
{
  "landing": {
    "badge": "Segera diluncurkan",
    "headline": "Panggungnya produk Indonesia.",
    "beat1": "Setiap minggu, developer dan founder Indonesia meluncurkan produk luar biasa — lalu tenggelam di platform global yang tidak dibuat untuk kita. Zona waktu yang salah, bahasa yang salah, audiens yang salah.",
    "beat2": "Produknesia adalah panggung tempat karya anak bangsa launch lebih dulu: ditemukan, didukung, dan didiskusikan oleh komunitasnya sendiri.",
    "beat3": "Kami membuka panggung bersama 100+ produk pertama. Jadilah yang pertama tahu — atau jadilah salah satu yang tampil.",
    "emailPlaceholder": "kamu@email.com",
    "joinWaitlist": "Ikut daftar tunggu",
    "joined": "Kamu di daftar! Sampai jumpa di hari peluncuran.",
    "alreadyIn": "Kamu sudah di dalam — sampai jumpa di hari peluncuran.",
    "or": "atau",
    "signInGoogle": "Masuk dengan Google",
    "makerCta": "Punya produk? Kirim sekarang →",
    "proof": "{count} produk sudah bersiap untuk peluncuran"
  },
  "validation": { "emailInvalid": "Masukkan alamat email yang valid." }
}
```

(Merge into existing `validation` objects.) Parity test → PASS.

- [ ] **Step 4: Waitlist action**

`src/app/actions/waitlist.ts`:

```ts
"use server";

import { parseWaitlistForm } from "@/lib/validation";
import { addSubscriber } from "@/db/queries/waitlist";

export type WaitlistState = { ok: boolean; errors: Record<string, string> };

export async function joinWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = parseWaitlistForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  // Duplicates return ok too — identical response, no enumeration.
  await addSubscriber(parsed.email);
  return { ok: true, errors: {} };
}
```

- [ ] **Step 5: WaitlistForm (client) + Landing (server)**

`src/components/WaitlistForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  joinWaitlistAction,
  type WaitlistState,
} from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: WaitlistState = { ok: false, errors: {} };

export function WaitlistForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(
    joinWaitlistAction,
    initialState,
  );

  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-chart-3/40 bg-chart-3/10 px-4 py-3 text-base">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
        {t("landing.joined")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="email"
          name="email"
          required
          placeholder={t("landing.emailPlaceholder")}
          aria-label={t("landing.emailPlaceholder")}
          className="flex-1"
        />
        <Button type="submit" disabled={pending} className="cursor-pointer">
          {pending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {t("landing.joinWaitlist")}
        </Button>
      </div>
      {state.errors.email && (
        <p className="text-sm text-destructive">{t(state.errors.email)}</p>
      )}
    </form>
  );
}
```

`src/components/Landing.tsx`:

```tsx
import { LogIn, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { Link } from "@/i18n/navigation";
import { localePath } from "@/i18n/locale-path";
import { countApprovedProducts } from "@/db/queries/products";
import { FadeUp } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";
import { WaitlistForm } from "@/components/WaitlistForm";
import { PendingButton } from "@/components/PendingButton";

export async function Landing() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const [session, count] = await Promise.all([
    auth(),
    countApprovedProducts(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <FadeUp>
        <Badge variant="outline" className="border-primary/40 text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("badge")}
        </Badge>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          {t("headline")}
        </h1>
      </FadeUp>

      <div className="mt-10 flex flex-col gap-5 text-lg leading-relaxed text-muted-foreground">
        <p>{t("beat1")}</p>
        <p className="text-foreground">{t("beat2")}</p>
        <p>{t("beat3")}</p>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        {session?.user ? (
          <p className="text-base font-medium">{t("alreadyIn")}</p>
        ) : (
          <>
            <WaitlistForm />
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: localePath(locale, "/") });
              }}
            >
              <PendingButton variant="outline" className="cursor-pointer">
                <LogIn className="size-4" aria-hidden="true" />
                {t("signInGoogle")}
              </PendingButton>
            </form>
          </>
        )}
      </div>

      <div className="mt-12 border-t pt-8">
        <Link
          href="/submit"
          className="cursor-pointer font-heading text-lg font-bold text-primary hover:underline"
        >
          {t("makerCta")}
        </Link>
        {count >= 10 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("proof", { count })}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Homepage branch**

In `src/app/[locale]/page.tsx`, restructure the top so the landing renders
before any feed work (imports: `isComingSoon`, `isAdmin`, `Landing`):

```tsx
const session = await auth();
if (isComingSoon() && !isAdmin(session)) {
  return <Landing />;
}
const [items, cats] = await Promise.all([listFeed(sort), listCategories()]);
```

(`auth()` leaves the existing `Promise.all` — it now runs first for the
branch; feed queries only run post-launch or for admins.)

- [ ] **Step 7: Gates + commit**

`pnpm test` all pass; `npx tsc --noEmit` clean; `pnpm build` succeeds.
Manual: `LAUNCH_MODE=coming_soon pnpm dev` → `/` shows the landing (badge,
headline, beats, waitlist form, Google button, maker CTA); waitlist join
shows the success state; signed-in non-admin sees "alreadyIn"; admin sees
the feed.

```bash
git add -A
git commit -m "feat: add story landing with waitlist and homepage gate"
```

---

### Task 4: Cursor pagination + WIB day grouping (TDD)

**Files:**
- Modify: `src/db/queries/products.ts` (+ `listFeedPage`, `FEED_PAGE_SIZE`)
- Modify: `src/db/queries/products.test.ts` (extend)
- Create: `src/lib/feed-days.ts`
- Test: `src/lib/feed-days.test.ts`

**Interfaces:**
- Produces:
  - `FEED_PAGE_SIZE = 30`
  - `listFeedPage(cursor: string | null, dbc?): Promise<{ items: FeedItem[]; nextCursor: string | null }>` — approved only, `launchedAt desc, id desc`, keyset cursor `${iso}_${id}`; invalid cursors treated as null (first page).
  - `groupByLaunchDay<T extends { launchedAt: Date | null; voteCount: number }>(items: T[], now?: Date): { key: string; kind: "today" | "yesterday" | "date"; date: Date; items: T[] }[]` from `src/lib/feed-days.ts` — WIB day keys, groups ordered newest day first, items within a day sorted `voteCount desc`; null `launchedAt` items are skipped.

- [ ] **Step 1: Failing listFeedPage tests**

Append to `src/db/queries/products.test.ts` (extend the `./products` import
with `listFeedPage, FEED_PAGE_SIZE`; `products` schema + `eq` are imported
in the feed test already via dynamic import — use the same trick):

```ts
describe("listFeedPage", () => {
  it("walks pages by cursor without overlap or gaps", async () => {
    const { products } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const made: string[] = [];
    for (let i = 0; i < 35; i++) {
      const p = await createProduct(newProduct({ name: `Feed ${i}` }), db);
      await approveProduct(p.id, db);
      // Distinct launch times so ordering is deterministic.
      await db
        .update(products)
        .set({ launchedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) })
        .where(eq(products.id, p.id));
      made.push(p.id);
    }
    const page1 = await listFeedPage(null, db);
    expect(page1.items).toHaveLength(FEED_PAGE_SIZE);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listFeedPage(page1.nextCursor, db);
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
    const all = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(all).size).toBe(35);
    expect(page1.items[0].name).toBe("Feed 34"); // newest first
  });

  it("treats a garbage cursor as the first page", async () => {
    const p = await createProduct(newProduct({ name: "Solo" }), db);
    await approveProduct(p.id, db);
    const page = await listFeedPage("not_a_cursor", db);
    expect(page.items.map((i) => i.name)).toContain("Solo");
  });
});
```

Run → FAIL (not exported).

- [ ] **Step 2: Implement listFeedPage**

Append to `src/db/queries/products.ts` (extend the drizzle import with `lt`,
`or`, `isNotNull`):

```ts
export const FEED_PAGE_SIZE = 30;

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  const sep = cursor.lastIndexOf("_");
  if (sep <= 0) return null;
  const at = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (Number.isNaN(at.getTime()) || !id) return null;
  return { at, id };
}

export async function listFeedPage(
  cursor: string | null,
  dbc: DBClient = db,
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const decoded = cursor ? decodeCursor(cursor) : null;
  const base = and(
    eq(products.status, "approved"),
    isNotNull(products.launchedAt),
  );
  const where = decoded
    ? and(
        base,
        or(
          lt(products.launchedAt, decoded.at),
          and(
            eq(products.launchedAt, decoded.at),
            lt(products.id, decoded.id),
          ),
        ),
      )
    : base;

  const rows = await dbc
    .select(feedColumns)
    .from(products)
    .innerJoin(users, eq(products.makerId, users.id))
    .where(where)
    .orderBy(desc(products.launchedAt), desc(products.id))
    .limit(FEED_PAGE_SIZE + 1);

  const items = rows.slice(0, FEED_PAGE_SIZE);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > FEED_PAGE_SIZE && last?.launchedAt
      ? `${last.launchedAt.toISOString()}_${last.id}`
      : null;
  return { items, nextCursor };
}
```

Run → PASS.

- [ ] **Step 3: Failing groupByLaunchDay tests**

`src/lib/feed-days.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupByLaunchDay } from "./feed-days";

// "now" = 2026-07-21 19:00 UTC = 2026-07-22 02:00 WIB → today(WIB)=2026-07-22
const NOW = new Date("2026-07-21T19:00:00Z");

function item(iso: string, voteCount = 0) {
  return { launchedAt: new Date(iso), voteCount };
}

describe("groupByLaunchDay", () => {
  it("groups by WIB calendar day, not UTC", () => {
    const groups = groupByLaunchDay(
      [
        item("2026-07-21T18:00:00Z"), // 22 Jul 01:00 WIB → today
        item("2026-07-21T10:00:00Z"), // 21 Jul 17:00 WIB → yesterday
        item("2026-07-20T16:59:00Z"), // 20 Jul 23:59 WIB → date
      ],
      NOW,
    );
    expect(groups.map((g) => g.kind)).toEqual(["today", "yesterday", "date"]);
    expect(groups.map((g) => g.key)).toEqual([
      "2026-07-22",
      "2026-07-21",
      "2026-07-20",
    ]);
  });

  it("sorts items within a day by votes and skips null launchedAt", () => {
    const a = item("2026-07-21T18:00:00Z", 5);
    const b = item("2026-07-21T20:00:00Z", 9);
    const groups = groupByLaunchDay(
      [a, b, { launchedAt: null, voteCount: 99 }],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.voteCount)).toEqual([9, 5]);
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implement `src/lib/feed-days.ts`**

```ts
const WIB_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(date: Date): string {
  return WIB_DAY.format(date); // en-CA → YYYY-MM-DD
}

export type LaunchDayGroup<T> = {
  key: string;
  kind: "today" | "yesterday" | "date";
  date: Date;
  items: T[];
};

/** Groups feed items by Asia/Jakarta calendar day (newest first); items
 * within a day are sorted by votes. Pure — inject `now` in tests. */
export function groupByLaunchDay<
  T extends { launchedAt: Date | null; voteCount: number },
>(items: T[], now: Date = new Date()): LaunchDayGroup<T>[] {
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - 24 * 3600 * 1000));

  const map = new Map<string, LaunchDayGroup<T>>();
  for (const item of items) {
    if (!item.launchedAt) continue;
    const key = dayKey(item.launchedAt);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        kind:
          key === todayKey
            ? "today"
            : key === yesterdayKey
              ? "yesterday"
              : "date",
        date: item.launchedAt,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(item);
  }
  const groups = [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const g of groups) g.items.sort((a, b) => b.voteCount - a.voteCount);
  return groups;
}
```

Run → PASS (2/2).

- [ ] **Step 5: Full suite + commit**

`pnpm test` all pass; `npx tsc --noEmit` clean.

```bash
git add -A
git commit -m "feat: add feed cursor pagination and WIB day grouping"
```

---

### Task 5: Daily-digest homepage + load more

**Files:**
- Modify: `src/components/ProductCard.tsx` (universal: `useTranslations`, non-async)
- Create: `src/app/actions/feed.ts`
- Create: `src/components/DailyDigest.tsx`
- Modify: `src/app/[locale]/page.tsx` (digest default, Populer tab kept)
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `listFeedPage`/`FEED_PAGE_SIZE`/`FeedItem` and `groupByLaunchDay` (Task 4), `getVotedProductIds`, `ProductCard` props unchanged.
- Produces:
  - `ProductCard` becomes non-async (safe in client trees); same props.
  - `type DigestItem = Omit<FeedItem, "launchedAt"> & { launchedAt: string | null; viewerVoted: boolean }` (serialized for the client) from `src/app/actions/feed.ts`.
  - `loadMoreFeed(cursor: string): Promise<{ items: DigestItem[]; nextCursor: string | null }>` server action.
  - `DailyDigest({ initialItems, initialCursor, locale })` client component.

- [ ] **Step 1: Make ProductCard universal**

In `src/components/ProductCard.tsx`:
- change `import { getTranslations } from "next-intl/server";` to
  `import { useTranslations } from "next-intl";`
- change `export async function ProductCard({` to `export function ProductCard({`
- change `const t = await getTranslations("feed");` to
  `const t = useTranslations("feed");`

Nothing else changes. (next-intl's `useTranslations` works in non-async
server components AND client components; existing server call sites keep
working, and Task 5's client list can now render it.)

Run: `pnpm test` → all pass (LanguageSwitcher/SubmitForm suites unaffected).

- [ ] **Step 2: i18n (both catalogs)**

`messages/en.json`, inside the existing `feed` object, add:

```json
{ "today": "Today", "yesterday": "Yesterday", "loadMore": "Load more" }
```

`messages/id.json` `feed` object:

```json
{ "today": "Hari ini", "yesterday": "Kemarin", "loadMore": "Muat lagi" }
```

Parity → PASS.

- [ ] **Step 3: loadMoreFeed action**

`src/app/actions/feed.ts`:

```ts
"use server";

import { auth } from "@/auth";
import {
  listFeedPage,
  type FeedItem,
} from "@/db/queries/products";
import { getVotedProductIds } from "@/db/queries/votes";

export type DigestItem = Omit<FeedItem, "launchedAt"> & {
  launchedAt: string | null;
  viewerVoted: boolean;
};

export async function serializeFeedItems(
  items: FeedItem[],
): Promise<DigestItem[]> {
  const session = await auth();
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();
  return items.map((i) => ({
    ...i,
    launchedAt: i.launchedAt ? i.launchedAt.toISOString() : null,
    viewerVoted: votedIds.has(i.id),
  }));
}

export async function loadMoreFeed(
  cursor: string,
): Promise<{ items: DigestItem[]; nextCursor: string | null }> {
  const page = await listFeedPage(cursor);
  return { items: await serializeFeedItems(page.items), nextCursor: page.nextCursor };
}
```

(`serializeFeedItems` is exported for the homepage's first-page reuse — a
"use server" export must be async; it is.)

- [ ] **Step 4: DailyDigest client component**

`src/components/DailyDigest.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { loadMoreFeed, type DigestItem } from "@/app/actions/feed";
import { groupByLaunchDay } from "@/lib/feed-days";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DailyDigest({
  initialItems,
  initialCursor,
  locale,
}: {
  initialItems: DigestItem[];
  initialCursor: string | null;
  locale: string;
}) {
  const t = useTranslations("feed");
  const format = useFormatter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();

  const groups = groupByLaunchDay(
    items.map((i) => ({
      ...i,
      launchedAt: i.launchedAt ? new Date(i.launchedAt) : null,
    })),
  );

  function handleLoadMore() {
    if (!cursor || pending) return;
    startTransition(async () => {
      const page = await loadMoreFeed(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="font-heading text-lg font-bold">
            {group.kind === "today"
              ? t("today")
              : group.kind === "yesterday"
                ? t("yesterday")
                : format.dateTime(group.date, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            {group.items.map((item, i) => (
              <ProductCard
                key={item.id}
                item={{
                  ...item,
                  launchedAt: item.launchedAt,
                }}
                locale={locale}
                viewerVoted={item.viewerVoted}
                rank={i + 1}
              />
            ))}
          </div>
        </section>
      ))}
      {cursor && (
        <Button
          variant="outline"
          onClick={handleLoadMore}
          disabled={pending}
          className={cn("mx-auto cursor-pointer")}
        >
          {pending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
```

Type note: `ProductCard`'s `item` prop is `FeedItem` (Date launchedAt) but
`DigestItem.launchedAt` is a string; ProductCard never reads `launchedAt`
(verify — it reads name/tagline/logo/maker/counts). Give ProductCard's prop
the honest shape instead of casting: change its `item` type to
`Omit<FeedItem, "launchedAt"> & { launchedAt: Date | string | null }` in the
same commit and drop the wrapper object above to just `item={item}`.

- [ ] **Step 5: Homepage — digest default + Populer**

Rework `src/app/[locale]/page.tsx` (post-landing-branch section):

- `sort` param: `"populer"` selects the leaderboard; anything else = digest.
  Tabs: "Terbaru" (`/`) default, "Populer" (`/?sort=populer`).
- Digest branch:

```tsx
const page = await listFeedPage(null);
const initialItems = await serializeFeedItems(page.items);
// render:
<DailyDigest
  initialItems={initialItems}
  initialCursor={page.nextCursor}
  locale={locale}
/>
```

- Populer branch: existing `listFeed("popular")` + `StaggerList` +
  `ProductCard rank={i + 1}` rendering, unchanged.
- Keep the category chips + heading. The empty state renders when the digest
  first page is empty.
- Update the tab links/icons: Terbaru first (Sparkles), Populer second
  (Flame); active style unchanged.

- [ ] **Step 6: Gates + commit**

`pnpm test` all pass; `npx tsc --noEmit` clean; `pnpm build` succeeds.
Manual (LAUNCH_MODE unset, dummy data present): `/` shows day sections with
per-day ranks; "Muat lagi" appends more days; votes work on appended cards;
`/?sort=populer` shows the all-time leaderboard.

```bash
git add -A
git commit -m "feat: daily-digest homepage with cursor load-more"
```

---

### Task 6: Announce script + final verification

**Files:**
- Create: `scripts/announce-launch.ts`
- Modify: `README.md` (launch-day checklist section)

**Interfaces:**
- Consumes: `listSubscriberEmails` (T1), `sendEmails` (`src/lib/email.ts`), `users` table.

- [ ] **Step 1: The script**

`scripts/announce-launch.ts`:

```ts
// Launch announcement — dry-runs by default; pass --yes to send.
import { config } from "dotenv";
config({ path: [".env.local"] });

async function main() {
  const { db } = await import("../src/db/index");
  const { users } = await import("../src/db/schema");
  const { isNotNull } = await import("drizzle-orm");
  const { listSubscriberEmails } = await import("../src/db/queries/waitlist");
  const { sendEmails } = await import("../src/lib/email");

  const subscriberEmails = await listSubscriberEmails();
  const userRows = await db
    .select({ email: users.email })
    .from(users)
    .where(isNotNull(users.email));
  const recipients = [
    ...new Set([
      ...subscriberEmails,
      ...userRows.map((r) => r.email as string),
    ]),
  ];

  const base = process.env.APP_URL ?? "https://produknesia.antaras.io";
  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222">
  <h2 style="margin:24px 0 8px">Panggungnya dibuka. 🚀</h2>
  <p>Produknesia resmi diluncurkan — panggung tempat karya anak bangsa
  launch lebih dulu. 100+ produk Indonesia sudah menunggu untuk kamu
  temukan, dukung, dan diskusikan.</p>
  <p style="margin:20px 0">
    <a href="${base}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Jelajahi Produknesia →</a>
  </p>
  <p style="color:#555">The stage is open: Produknesia has launched —
  100+ Indonesian products are waiting to be discovered.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#777">Kamu menerima email ini karena
  mendaftar di daftar tunggu atau punya akun Produknesia. Abaikan jika
  tidak merasa mendaftar. / You received this because you joined the
  waitlist or have a Produknesia account; ignore it if unexpected.</p>
</div>`.trim();

  console.log(`Recipients: ${recipients.length}`);
  if (!process.argv.includes("--yes")) {
    console.log("Dry run — pass --yes to send.");
    process.exit(0);
  }
  await sendEmails(
    recipients.map((to) => ({
      to,
      subject: "Produknesia sudah diluncurkan 🚀",
      html,
    })),
  );
  console.log("Sent.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Verify dry-run: `npx tsx scripts/announce-launch.ts` → prints recipient
count and "Dry run", sends nothing.

- [ ] **Step 2: README launch checklist**

Append to `README.md`:

```markdown
## Launch day

1. Wipe demo data (Neon SQL console):
   `delete from products where website_url like '%.contoh-demo.id%';`
   `delete from users where email like '%@dummy.produknesia.local%';`
2. Remove `LAUNCH_MODE` from Vercel env → redeploy.
3. Announce: `npx tsx scripts/announce-launch.ts --yes`
```

- [ ] **Step 3: Full gates + manual smoke**

`pnpm test` (all pass, pristine), `npx tsc --noEmit` (clean), `pnpm build`
(succeeds). Manual with `LAUNCH_MODE=coming_soon pnpm dev`: route table from
the spec §1 as guest / signed-in / admin; waitlist join + dedupe; landing in
both locales. With the flag unset: digest homepage, load-more, Populer tab.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add launch announce script and launch-day checklist"
```

---

## Post-merge operational step (controller)

After merging: set `LAUNCH_MODE=coming_soon` in Vercel production env and
redeploy — the public site flips to the landing (hiding the demo catalog)
while invitations go out.

## Self-Review

- **Spec coverage:** flag + helper (T2) ✓; gate table — categories/search/
  profiles redirect (T2), homepage landing (T3), open routes untouched ✓;
  header search hidden (T2) ✓; waitlist table/queries/no-enumeration (T1, T3)
  ✓; landing structure incl. both CTAs, alreadyIn state, maker CTA, live
  count hidden <10 (T3) ✓; full bilingual copy from the spec (T3 Step 3) ✓;
  daily digest with WIB grouping/per-day ranks (T4, T5) ✓; keyset pagination,
  page size 30, garbage-cursor fallback (T4) ✓; Populer tab unchanged (T5) ✓;
  announce script with --yes safety + README checklist (T6) ✓; launch-day
  flip as a controller step ✓.
- **Placeholder scan:** none; two explicit contingencies (zod email API
  variant; ProductCard prop-type honest widening) are instructions with code.
- **Type consistency:** `FeedItem`/`FEED_PAGE_SIZE`/`listFeedPage` (T4) used
  by T5's action/page; `DigestItem` defined in `src/app/actions/feed.ts` and
  consumed by `DailyDigest`; `groupByLaunchDay` signature identical in T4
  tests and T5 usage; `WaitlistState` matches between action and form;
  `Landing` takes no props (locale via `getLocale`) and the homepage renders
  `<Landing />` accordingly; `countApprovedProducts` name consistent T3.
