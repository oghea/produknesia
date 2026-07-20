# Produknesia — Design Spec

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan

## Summary

Produknesia is an Indonesia-focused Product Hunt: makers submit products, the
community upvotes and discusses them, everything organized by category and
searchable. The UI is bilingual (Bahasa Indonesia / English). Product
submissions go through an admin approval queue before going live.

## Goals

- Give Indonesian makers a place to launch products and get discovered.
- Support the core Product Hunt loop: submit → discover → upvote → discuss.
- Ship as small, deployable increments; each phase leaves a working site.
- Keep the data model ready for a future daily leaderboard without migration.

## Non-Goals (v1)

- Daily leaderboards / time-decay "hot" ranking (data model is ready; UI is not built).
- Newsletters, notifications, maker verification, analytics dashboards.
- Full-text search (v1 uses `ILIKE`).
- Per-field translation tables (v1 uses per-locale columns for two locales).

## Stack

- **Framework:** Next.js (App Router). Server Components for read pages
  (feed, product detail, profiles, category/search). Server Actions +
  route handlers for mutations (submit, vote, comment).
- **Database:** Neon (serverless Postgres).
- **ORM:** Drizzle — lightweight, type-safe, works well with Neon's serverless
  driver and Vercel functions.
- **Auth:** Auth.js (NextAuth) with the Drizzle adapter; sessions in Neon.
  Google OAuth + email to start.
- **Image storage:** Vercel Blob (logos + screenshots), uploaded via server action.
- **i18n:** `next-intl` — locale in the URL (`/id/...`, `/en/...`), per-locale
  message catalogs, switcher in the header.
- **Deployment:** Vercel.

## Architecture

```
Next.js (App Router)
 ├─ public pages: feed, product detail, profiles, category/search  (Server Components, read from Neon)
 ├─ auth flows: Auth.js routes
 ├─ mutations: server actions — submit product, upvote, comment
 ├─ admin: approval queue (role-gated)
 └─ Neon Postgres (via Drizzle)  +  Vercel Blob (images)
```

Module boundaries (each understandable/testable on its own):

- `db/` — Drizzle schema + query functions.
- `auth/` — Auth.js config, session helpers, role checks.
- `products/` — submit, list, detail, slug generation.
- `votes/` — toggle vote, keep denormalized count in sync.
- `comments/` — create, list (threaded), soft-delete.
- `admin/` — approval queue and actions.
- `i18n/` — `next-intl` config, message catalogs, locale switcher.

## Data Model

Drizzle schema over Neon Postgres.

### `users`
id, name, username (unique — profile URLs), email, image, bio,
role (`user` | `admin`), created_at.
Auth.js adapter also creates `accounts`, `sessions`, `verification_tokens`
(standard, not detailed here).

### `products`
- id, slug (unique — `/products/[slug]`)
- name
- tagline_id, tagline_en (short one-liner, per locale)
- description_id, description_en (long, markdown, per locale)
- website_url
- logo_url
- maker_id → users
- status: `pending` | `approved` | `rejected`
- launched_at (timestamp, set on approval — enables future daily leaderboard)
- vote_count (denormalized cached count for cheap sorting)
- comment_count (denormalized)
- created_at

Maker fills their primary-language tagline/description; the other locale is
optional. UI shows what exists and falls back to the populated locale.

### `product_images`
id, product_id → products, url, sort_order. (Screenshots.)

### `categories`
id, slug, name_id, name_en.

### `product_categories`
product_id → products, category_id → categories. (Many-to-many.)

### `votes`
id, product_id → products, user_id → users, created_at.
**Unique (product_id, user_id)** — one vote per user per product.
`products.vote_count` kept in sync on add/remove within the same transaction.

### `comments`
id, product_id → products, user_id → users, parent_id (nullable — one level of
threaded replies), body (markdown), is_deleted (soft delete), created_at.

### Sorting

- "Popular" → `ORDER BY vote_count DESC`
- "Newest" → `ORDER BY launched_at DESC`
- Both filtered to `status = 'approved'`.

## Key Flows

### Submit a product (auth required)
Maker fills form (name, tagline, description, website, category, logo +
screenshots). Images upload to Vercel Blob via server action → URLs saved.
Product created with `status = 'pending'`, shown in maker's profile as
"Under review." Slug auto-generated from name with a collision suffix.

### Approval (admin only)
`/admin` lists `pending` products. Approve → `status = 'approved'`,
`launched_at = now()`, goes live. Reject → `status = 'rejected'` with an
optional reason shown to the maker. Server actions verify
`session.user.role === 'admin'`; `/admin` redirects non-admins.

### Upvote (auth required)
Toggle: insert vote (respecting the unique constraint) or delete it, adjusting
`products.vote_count` in the same transaction. Optimistic UI update. Guests are
prompted to sign in.

### Browse / discover
Home feed = approved products with a **Popular / Newest** toggle (no daily
buckets in v1 — keeps the page alive at low traffic). Category pages filter by
category. Search uses Postgres `ILIKE` over name/tagline. Product detail page
shows full content + comment thread.

### Comment (auth required)
Markdown body, one level of replies, standard submit (pending-disabled button,
form resets on success — optimism is reserved for the high-frequency vote
action), soft-delete by author or admin.

## Ranking Rationale

Low expected early traffic makes a daily leaderboard look empty. v1 ships a
single feed with a Popular/Newest toggle. Because every product stores
`launched_at` and every vote stores `created_at`, the site can switch on daily
leaderboards or a time-decay hot score later with no data migration.

## Phasing

Build in order; each phase leaves a working, deployable site.

- **Phase 1 — Foundation:** Next.js + Drizzle + Neon schema, Auth.js login,
  i18n scaffolding, base layout/header with language switcher. (Deployable skeleton.)
- **Phase 2 — Core loop:** Submit product (with Blob uploads) → admin approval
  queue → live feed (Popular/Newest) → product detail page.
- **Phase 3 — Community:** Upvoting + comments.
- **Phase 4 — Discovery & profiles:** Categories, search, user profile pages
  (submissions + upvotes).
