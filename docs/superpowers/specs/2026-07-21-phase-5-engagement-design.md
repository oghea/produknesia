# Phase 5: Engagement & Growth — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan

## Summary

Three features that keep users coming back and seed real content:

1. **Product updates (changelog)** — makers post versioned release notes on
   their product; approved updates form a public history on the product page.
2. **Watch + email notifications** — users watch a product and receive an
   email whenever one of its updates is approved. Tokenized unsubscribe.
3. **Admin invites** — an admin prepares a prefilled submission and sends a
   claim link to a real maker, who signs in, tweaks it, and publishes it as
   their own, instantly approved.

## Decisions (owner-confirmed)

- Updates go through the **admin review queue** (pending → approved/rejected
  with reason), like product submissions.
- Update title/body are **bilingual** (optional ID/EN pairs, ≥1 language
  required, viewer-locale-with-fallback rendering — same pattern as taglines).
- Email provider is **Resend** from day one (free tier; `RESEND_API_KEY` +
  `EMAIL_FROM` env vars; test sender in dev, custom domain later).
- Emails send **on update approval** (the admin action is the spam-proof
  trigger), fire-and-forget after the DB commit — email failure never breaks
  the action.
- Invite claims are **editable and auto-approved**: the invitee can adjust the
  prefill before submitting; the product goes live immediately as theirs
  (admin already vetted the content).

## Non-Goals (this phase)

- Digest/batched emails, email preferences pages, or notifications for
  anything other than update approvals (no vote/comment emails).
- Editing or deleting published updates (admin can handle abuse manually).
- Invite emails sent by the app (admin copies the link and sends it however
  they like — WhatsApp, DM, email).
- Watching users or categories; watcher counts on the UI.

## Data Model

Three new tables (one migration), following existing conventions — cuid ids,
`timestamptz`, cascade FKs, drizzle:

### `product_updates`
- id, productId → products (cascade), authorId → users
- version (nullable text, e.g. "v1.2.0")
- titleId, titleEn (nullable text; ≥1 required — enforced by validation)
- bodyId, bodyEn (nullable text, markdown; ≥1 required)
- status: `pending` | `approved` | `rejected` (default pending)
- rejectionReason (nullable)
- publishedAt (timestamptz, set on approval), createdAt
- Indexes: (productId, status, publishedAt desc); (status) for the admin queue.

### `product_watches`
- id, productId → products (cascade), userId → users (cascade)
- unsubscribeToken (text, unique, cuid — email links unsubscribe without login)
- createdAt; UNIQUE (productId, userId)
- Index on userId.

### `invites`
- id, token (text, unique, cuid)
- draft (jsonb — { name, taglineId?, taglineEn?, descriptionId?,
  descriptionEn?, websiteUrl, categoryIds[], logoUrl?, screenshotUrls[] };
  validated with the existing product zod schema on create AND on claim)
- note (nullable — admin's private "for whom" memo)
- createdBy → users; expiresAt (timestamptz, default now + 14 days)
- claimedBy → users (nullable), claimedProductId → products (nullable),
  claimedAt (nullable), createdAt.

## Modules

- `src/db/queries/updates.ts` — createUpdate (pending, validates product
  approved + author is maker or admin), listUpdatesForProduct (approved for
  the public; all for maker/admin), listPendingUpdates, approveUpdate (sets
  publishedAt; returns update + product + watcher emails for the fan-out),
  rejectUpdate(reason).
- `src/db/queries/watches.ts` — toggleWatch (approved products only; returns
  {watching}), isWatching, listWatcherEmails(productId),
  unsubscribeByToken(token) → boolean.
- `src/db/queries/invites.ts` — createInvite(draft, note, createdBy),
  getInviteByToken (null if missing/expired/claimed), listInvites,
  claimInvite(token, userId, finalData) → creates the product (status
  approved, launchedAt now, makerId = claimer) and marks the invite claimed,
  in one transaction; re-validates finalData.
- `src/lib/email.ts` — `sendEmails(messages: {to, subject, html}[])` over
  Resend's batch API (chunks of 100). Missing `RESEND_API_KEY` → logs and
  returns (never throws). Template: update-approved email (product name,
  version, localized title/body ID-first-EN-fallback rendered from markdown,
  product link, unsubscribe link).
- All queries take `dbc: DBClient = db`; PGlite TDD as established.

## Flows

### Post an update (maker)
Product page shows "Post update" to its maker (and admins) →
`/products/[slug]/updates/new`: version (optional), bilingual title/body
(≥1 language). Creates `pending`. Maker sees pending/rejected updates on the
product page with status badges (public sees approved only).

### Product page "Updates" section
Below the description: newest-first approved updates — version badge, date,
localized title, markdown body (same hardened renderer as comments: no raw
HTML, no images, nofollow links... author is semi-trusted but consistent).

### Admin review
`/admin` gains a "Pending updates" section: product name + version + title +
body preview, approve / reject-with-reason. Approve = status approved,
publishedAt = now, then fan-out: fetch watcher emails, `sendEmails` in the
background of the action (after commit), `revalidatePath`.

### Watch
Bell WatchButton beside the vote button on approved product pages — same
toggle/auth pattern as votes (guest → Google sign-in → back). Watching state
persists; unwatch via the same button or the email's
`/unwatch/[token]` route (no login; deletes the watch; confirmation page;
invalid token → friendly message).

### Invites (admin)
`/admin/invites`: list (open / claimed / expired, with notes and copy-link
buttons) + "New invite" form — same fields/uploads as submit plus the note.
Creates the invite and shows the copyable claim URL.

### Claim
`/claim/[token]`: valid+open → preview of the prefilled app; guest sees a
Google sign-in CTA (redirect back to the claim page). Signed in → prefilled,
editable submit form (existing images shown, replaceable). Submit →
`claimInvite` transaction → redirect to the live product page. Expired,
claimed, or unknown tokens → localized dead-end page. A claimer who already
has products is fine; one claim per invite.

## Error Handling

- Email fan-out failures: logged, never surfaced to the admin action (the
  approval already committed). No retry queue in this phase.
- Claim race (two people with the same link): the claim transaction guards
  `claimedBy IS NULL` — loser gets the already-claimed page.
- Draft jsonb is re-validated with the zod schema at claim time; if the admin
  prefill has grown invalid (e.g. category deleted), the claimer sees field
  errors like any submitter.

## Security

- createUpdate: session required; author must be the product's maker or an
  admin; product must be approved.
- approve/reject update, create invite, list invites: `assertAdmin` first,
  in the server action (established pattern).
- Claim: any signed-in user with a valid token; the token is the capability.
- unsubscribeToken and invite token are unguessable cuids; unsubscribe is
  deliberately login-free (industry standard for email links).
- Update/claim bodies rendered with the hardened markdown renderer.

## i18n

All new UI strings in both catalogs (parity test). Emails render ID content
first with EN fallback (single email per watcher, no per-user locale
tracking this phase).

## Testing

Query modules TDD'd on PGlite (status transitions, watch toggle + unique
constraint, unsubscribe token, claim transaction incl. double-claim race and
expiry). Validation additions TDD'd. Email lib unit-tested with a stubbed
fetch (no key → no-op; batching; template contains unsubscribe link).
Manual E2E smoke: post update → approve → email received (Resend test
sender) → unsubscribe link works; invite → claim → live product.

## Phasing (one implementation plan)

1. Migration: three tables, applied to dev Neon.
2. Updates query layer (TDD).
3. Update form + product-page Updates section.
4. Admin pending-updates queue (approve/reject).
5. Email lib (Resend) + unsubscribe route. *(Needs `RESEND_API_KEY`,
   `EMAIL_FROM` in `.env.local` + Vercel.)*
6. Watches query layer + WatchButton + fan-out wired into approval.
7. Invites query layer + `/admin/invites` UI.
8. Claim flow (`/claim/[token]`).
9. Final verification + manual E2E smoke.
