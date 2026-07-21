# Phase 6: Launch — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan

## Summary

Three connected deliverables that take Produknesia from "deployed" to "launched":

1. **Coming-soon mode** — a `LAUNCH_MODE` gate that hides the catalog from the
   public behind a story landing while 100+ invitations seed real products.
2. **The story landing** — bilingual narrative page (underdog → stage arc) with
   a dual Join CTA: email waitlist + Google sign-in, plus a maker CTA.
3. **Feed at scale** — the post-launch homepage becomes a Product Hunt-style
   daily digest (WIB day grouping, per-day ranks, cursor pagination), removing
   the hard 50-item cap.

Urgency note: dummy seed data is currently publicly visible on
produknesia.antaras.io — the gate ships first.

## Decisions (owner-confirmed)

- Gate scope: **admin + invite links**. Public sees the landing; admins see
  everything; claim links, product detail pages, submit, and unwatch stay
  reachable.
- Join CTA: **both** — email waitlist AND Google sign-in.
- Feed direction: **daily digest** (grouped by launch day, per-day ranking).
- Story angle: **underdog + stage** (buried on global platforms → a stage of
  our own).

## 1. Coming-soon mode

### Flag

`LAUNCH_MODE=coming_soon` environment variable. Unset (or any other value) =
launched. Flipping = update Vercel env + redeploy (~1 minute, done on launch
day). Helper in `src/lib/launch.ts`:

- `isComingSoon(): boolean` — reads the env var.

### Gate rules

| Route | Coming-soon behavior (non-admin) |
|---|---|
| `/` (feed) | Renders the story landing instead of the feed |
| `/categories/[slug]`, `/search`, `/u/[username]` | `redirect` to `/` (landing) |
| `/products/[slug]` | Reachable (unlisted — feed/search hidden). Existing status gate unchanged |
| `/submit`, `/products/[slug]/updates/new` | Reachable (invited makers keep working) |
| `/claim/[token]`, `/unwatch/[token]`, `/admin*` | Reachable (unchanged) |

- Admin check: `isAdmin(session)` bypasses the gate everywhere (admins see the
  real feed on `/`).
- Header in coming-soon for non-admins: wordmark + "Kirim" button + language
  switcher + theme toggle + sign-in/avatar. The search box is hidden (nothing
  to search publicly).
- Server actions need no extra gating: votes/comments already require
  sessions and approved products; the catalog simply isn't browsable.

### Waitlist

New table `launch_subscribers`:

- id (cuid), email (text, not null, **unique**), createdAt (timestamptz).

Query module `src/db/queries/waitlist.ts`:

- `addSubscriber(email, dbc?) -> { added: boolean }` — insert with
  `onConflictDoNothing` (`added: false` for duplicates — the UI still shows
  success; no email enumeration).
- `listSubscriberEmails(dbc?) -> string[]` — for the launch announce.

Server action `joinWaitlistAction(prev, formData)` — zod email validation
(error key `validation.emailInvalid`), returns `{ ok, errors }`; success state
persists ("Kamu di daftar!") even for duplicates.

No double-opt-in in v1 (self-submitted, single launch announcement; the
announce email includes a plain "ignore this if unexpected" line).

## 2. The story landing

Rendered by `/` when coming-soon (and NOT as a separate route — the homepage
is the landing pre-launch and the feed post-launch).

### Structure (top to bottom)

1. **Hero** — "Segera diluncurkan" badge; headline `Panggungnya produk
   Indonesia.` (display face, oversized); sub: the three story beats below.
2. **Story beats** (short paragraphs, generous type):
   - ID: "Setiap minggu, developer dan founder Indonesia meluncurkan produk
     luar biasa — lalu tenggelam di platform global yang tidak dibuat untuk
     kita. Zona waktu yang salah, bahasa yang salah, audiens yang salah."
   - ID: "Produknesia adalah panggung tempat karya anak bangsa launch lebih
     dulu: ditemukan, didukung, dan didiskusikan oleh komunitasnya sendiri."
   - ID: "Kami membuka panggung bersama 100+ produk pertama. Jadilah yang
     pertama tahu — atau jadilah salah satu yang tampil."
   - EN mirrors: "Every week, Indonesian developers and founders launch
     remarkable products — then drown on global platforms that weren't built
     for us. Wrong timezone, wrong language, wrong audience." / "Produknesia
     is the stage where Indonesian products launch first: discovered,
     upvoted, and discussed by their own community." / "We're opening the
     stage with the first 100+ products. Be the first to know — or be one of
     the makers on it."
3. **Join block** — email input + "Ikut daftar tunggu" (waitlist action) and
   a divider "atau", then "Masuk dengan Google" (existing signIn flow).
   Success state: "Kamu di daftar! Sampai jumpa di hari peluncuran." Signed-in
   users see the success-style line "Kamu sudah di dalam." instead of the form.
4. **Maker CTA** — "Punya produk? Kirim sekarang →" linking to `/submit`.
5. **Live social proof** — "**{count} produk** sudah bersiap untuk
   peluncuran" (live count of approved products; hidden below 10 so early
   invitees don't see "3 produk").

All strings in both catalogs (`landing.*` namespace + `validation.emailInvalid`).
Design language: existing tokens; the landing is the one place allowed an
oversized display-type moment (hero headline up to text-6xl).

## 3. Feed at scale (post-launch homepage)

### Daily digest (default tab: "Terbaru")

- Products grouped by **launch day in Asia/Jakarta (WIB)** — day keys computed
  with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })` style
  formatting, NOT server-local time.
- Day headers: "Hari ini", "Kemarin", then localized full dates ("Sabtu, 19
  Juli"). EN mirrors ("Today", "Yesterday").
- Within a day: ordered by voteCount desc; rank numerals restart per day
  (day's #1 red, rest muted) — replaces the current global numerals.
- Query: `listFeedPage(cursor?, dbc?)` — fetches `PAGE_SIZE = 30` approved
  products ordered `launchedAt desc, id desc` with a compound cursor
  `(launchedAt, id)`; returns `{ items: FeedItem[], nextCursor: string | null }`.
  Grouping happens in the page/server code (a pure, tested helper
  `groupByLaunchDay(items, locale)`); a day may span pages — the client
  appends and re-groups, so boundaries stay correct.
- **"Muat lagi"** — client component holding appended pages in state, calling
  a server action `loadMoreFeed(cursor)` that returns the next
  `{ items, nextCursor }` (dates serialized as ISO strings). Button shows the
  standard pending spinner; hidden when `nextCursor` is null.
- Vote buttons on appended items work as everywhere (client VoteButton).

### "Populer" tab

Unchanged behavior: all-time top 50 by votes with global rank numerals (the
existing `listFeed("popular")`). "Terbaru" becomes the default tab.

### Out of scope

Pagination for category/search/profile pages stays at their current limits
(50/20) this phase; the homepage is the launch surface.

## Launch-day checklist (ships in the spec + a script)

1. Wipe dummy data:
   `delete from products where website_url like '%.contoh-demo.id%';`
   `delete from users where email like '%@dummy.produknesia.local%';`
2. Flip: remove `LAUNCH_MODE` from Vercel env → redeploy.
3. Announce: run `scripts/announce-launch.ts` (tsx, dotenv-first pattern) —
   sends the launch email via the existing `sendEmails` lib to
   `listSubscriberEmails()` + all user emails, deduped. Bilingual body
   (ID first), links to the site, includes the "ignore if unexpected" line.
   The script prints the recipient count and requires `--yes` to actually send.

## Security & correctness notes

- The gate is enforced server-side in each gated page (not middleware — the
  proxy stays i18n-only per the Phase 1 constraint).
- Waitlist: unique email + `onConflictDoNothing`; success responses identical
  for new/duplicate (no enumeration); zod-validated; email lowercased+trimmed.
- Cursor pagination is keyset-based (no OFFSET drift when new products land
  mid-scroll).
- WIB grouping is a pure function with unit tests (dates around midnight WIB).

## Testing

- PGlite: waitlist add/dedupe; `listFeedPage` cursor walk (spanning pages,
  stable ordering, ties on launchedAt broken by id).
- Unit: `groupByLaunchDay` (WIB midnight boundaries, Hari ini/Kemarin
  labels); email validation; `isComingSoon`.
- Existing suites must stay green; manual smoke: gate behavior per route
  table as guest/user/admin, waitlist join, load-more past 30 items.

## Phasing (one implementation plan)

1. `launch_subscribers` migration + waitlist queries (TDD).
2. `isComingSoon` + route gating + coming-soon header variant.
3. Landing page (story copy, join block with both CTAs, maker CTA, live count).
4. Feed: `listFeedPage` cursor query + `groupByLaunchDay` (TDD).
5. Daily-digest homepage + load-more client component + Populer tab.
6. `scripts/announce-launch.ts` + verification + launch checklist doc.
