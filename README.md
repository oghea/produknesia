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
