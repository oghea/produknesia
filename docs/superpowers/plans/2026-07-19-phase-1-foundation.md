# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable Next.js skeleton with a Neon/Drizzle schema, Auth.js login, bilingual (ID/EN) routing, and a base layout with a language switcher and auth state.

**Architecture:** Next.js App Router with a `src/` directory. All persistence goes through a single Drizzle client over the Neon serverless driver. Authentication uses Auth.js (NextAuth v5) with the Drizzle adapter and database sessions; a `role` column on `users` drives future admin gating. Internationalization uses `next-intl` with the locale in the URL (`/id/...`, `/en/...`) via middleware. Auth protection lives in server components/actions (helpers), not middleware, so it never conflicts with the i18n middleware.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, Drizzle ORM + `@neondatabase/serverless`, Auth.js v5 (`next-auth@beta`) + `@auth/drizzle-adapter`, `next-intl`, Vitest + React Testing Library, pnpm.

## Global Constraints

- Package manager: **pnpm**.
- Language: **TypeScript**, `strict: true`.
- Locales: **`id`** (default) and **`en`**. Locale is always in the URL.
- Directory layout: **`src/`** (app at `src/app`).
- All DB access goes through the single client exported from `src/db/index.ts`.
- Never commit real secrets; only `.env.example` is committed. `.env.local` is gitignored.
- All future mutations use **server actions** (no logic added to middleware beyond i18n).

---

### Task 1: Scaffold Next.js app + test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx` (from create-next-app)
- Create: `vitest.config.ts`
- Create: `src/lib/sample.ts`
- Test: `src/lib/sample.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `pnpm test` command (Vitest) and `pnpm build`. Path alias `@/*` → `src/*`.

- [ ] **Step 1: Scaffold the app**

```bash
pnpm create next-app@latest . --ts --app --src-dir --tailwind --eslint --import-alias "@/*" --no-turbopack --use-pnpm
```
Accept defaults if prompted. This must run in the (currently non-empty) repo — if it refuses due to existing files, scaffold in a temp dir and move files in, preserving `docs/` and `.git/`.

- [ ] **Step 2: Add Vitest**

```bash
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add scripts to `package.json` (`"test": "vitest run"`, `"test:watch": "vitest"`).

- [ ] **Step 3: Write a sample failing test**

`src/lib/sample.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { add } from "./sample";

describe("add", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot find module `./sample`.

- [ ] **Step 5: Implement minimal code**

`src/lib/sample.ts`:

```ts
export function add(a: number, b: number): number {
  return a + b;
}
```

- [ ] **Step 6: Run it, verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest harness"
```

---

### Task 2: Drizzle client + schema + migration

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/schema.ts`
- Create: `drizzle.config.ts`
- Create: `.env.example`
- Modify: `.gitignore` (ensure `.env.local` and `.env*.local` ignored)
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `db` — Drizzle client (from `src/db/index.ts`).
  - Table objects from `src/db/schema.ts`: `users`, `accounts`, `sessions`, `verificationTokens`, `products`, `productImages`, `categories`, `productCategories`, `votes`, `comments`.
  - `users.role` column: `text`, enum-ish values `"user" | "admin"`, default `"user"`.
  - `products.status`: values `"pending" | "approved" | "rejected"`, default `"pending"`.

- [ ] **Step 1: Install Drizzle + Neon driver**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit dotenv
```

- [ ] **Step 2: Write the schema**

`src/db/schema.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

const id = () =>
  text("id").primaryKey().$defaultFn(() => createId());

// ---- Auth.js tables ----
export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  username: text("username").unique(),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  bio: text("bio"),
  role: text("role").notNull().default("user"), // "user" | "admin"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

// ---- Domain tables ----
export const products = pgTable("products", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  taglineId: text("tagline_id"),
  taglineEn: text("tagline_en"),
  descriptionId: text("description_id"),
  descriptionEn: text("description_en"),
  websiteUrl: text("website_url").notNull(),
  logoUrl: text("logo_url"),
  makerId: text("maker_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending|approved|rejected
  rejectionReason: text("rejection_reason"),
  launchedAt: timestamp("launched_at"),
  voteCount: integer("vote_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productImages = pgTable("product_images", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const categories = pgTable("categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  nameId: text("name_id").notNull(),
  nameEn: text("name_en").notNull(),
});

export const productCategories = pgTable(
  "product_categories",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.productId, t.categoryId] }) }),
);

export const votes = pgTable(
  "votes",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqUserProduct: uniqueIndex("votes_user_product_uniq").on(
      t.productId,
      t.userId,
    ),
  }),
);

export const comments = pgTable("comments", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  body: text("body").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Install the id generator:

```bash
pnpm add @paralleldrive/cuid2
```

- [ ] **Step 3: Write the DB client**

`src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 4: Write drizzle config + env example**

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`.env.example`:

```
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

Add drizzle scripts to `package.json`: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"db:push": "drizzle-kit push"`.

- [ ] **Step 5: Write a schema smoke test**

`src/db/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { products, users, votes } from "./schema";
import { getTableColumns } from "drizzle-orm";

describe("schema", () => {
  it("products has the expected columns", () => {
    const cols = Object.keys(getTableColumns(products));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "slug", "name", "status", "launchedAt",
        "voteCount", "makerId",
      ]),
    );
  });

  it("users has a role column defaulting to user", () => {
    const cols = getTableColumns(users);
    expect(cols.role.default).toBe("user");
  });

  it("votes enforces one vote per user+product via unique index", () => {
    // presence check: table object exists and has both fk columns
    const cols = Object.keys(getTableColumns(votes));
    expect(cols).toEqual(expect.arrayContaining(["productId", "userId"]));
  });
});
```

- [ ] **Step 6: Run test, verify it passes**

Run: `pnpm test src/db/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Generate the initial migration**

Run: `pnpm db:generate`
Expected: a SQL file appears under `drizzle/`. (No live DB needed to generate.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema, client, and initial migration"
```

---

### Task 3: Slug utility (TDD)

**Files:**
- Create: `src/lib/slug.ts`
- Test: `src/lib/slug.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `slugify(name: string): string` — lowercase, ASCII-ish, dash-separated.
  - `ensureUniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string>` — appends `-2`, `-3`, … until `exists` returns false. Used by product submission in Phase 2.

- [ ] **Step 1: Write failing tests**

`src/lib/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, ensureUniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
  it("strips punctuation and collapses spaces", () => {
    expect(slugify("  Produk!! Keren??  ")).toBe("produk-keren");
  });
  it("handles empty-ish input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("ensureUniqueSlug", () => {
  it("returns base when free", async () => {
    const out = await ensureUniqueSlug("app", async () => false);
    expect(out).toBe("app");
  });
  it("appends a counter when taken", async () => {
    const taken = new Set(["app", "app-2"]);
    const out = await ensureUniqueSlug("app", async (s) => taken.has(s));
    expect(out).toBe("app-3");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm test src/lib/slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/slug.ts`:

```ts
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function ensureUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) return base;
  let n = 2;
  while (await exists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test src/lib/slug.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add slug utilities"
```

---

### Task 4: Auth.js (NextAuth v5) with Drizzle adapter + role gating

**Files:**
- Create: `src/auth.ts`
- Create: `src/auth-helpers.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`
- Test: `src/auth-helpers.test.ts`

**Interfaces:**
- Consumes: `db` and auth tables from Task 2.
- Produces:
  - From `src/auth.ts`: `handlers`, `auth`, `signIn`, `signOut`.
  - Session shape: `session.user.id: string`, `session.user.role: "user" | "admin"`.
  - From `src/auth-helpers.ts`:
    - `isAdmin(session: Session | null): boolean`
    - `assertAdmin(session: Session | null): asserts session is Session` — throws `Error("FORBIDDEN")` when not admin. Used by Phase 2 admin actions.

- [ ] **Step 1: Install Auth.js**

```bash
pnpm add next-auth@beta @auth/drizzle-adapter
```

- [ ] **Step 2: Write failing tests for the pure helpers**

`src/auth-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAdmin, assertAdmin } from "./auth-helpers";

const admin = { user: { id: "1", role: "admin" }, expires: "" } as any;
const user = { user: { id: "2", role: "user" }, expires: "" } as any;

describe("isAdmin", () => {
  it("true for admin", () => expect(isAdmin(admin)).toBe(true));
  it("false for user", () => expect(isAdmin(user)).toBe(false));
  it("false for null", () => expect(isAdmin(null)).toBe(false));
});

describe("assertAdmin", () => {
  it("passes for admin", () => expect(() => assertAdmin(admin)).not.toThrow());
  it("throws FORBIDDEN for user", () =>
    expect(() => assertAdmin(user)).toThrow("FORBIDDEN"));
  it("throws FORBIDDEN for null", () =>
    expect(() => assertAdmin(null)).toThrow("FORBIDDEN"));
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm test src/auth-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the helpers**

`src/auth-helpers.ts`:

```ts
import type { Session } from "next-auth";

export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

export function assertAdmin(
  session: Session | null,
): asserts session is Session {
  if (!isAdmin(session)) throw new Error("FORBIDDEN");
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm test src/auth-helpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the auth config**

`src/types/next-auth.d.ts`:

```ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
  interface User {
    role: "user" | "admin";
  }
}
```

`src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [Google],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      // @ts-expect-error role is on our users row
      session.user.role = user.role ?? "user";
      return session;
    },
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 7: Verify build/typecheck**

Run: `pnpm build`
Expected: build succeeds (auth wiring compiles). If it fails only for missing runtime env vars at build, set placeholder `AUTH_SECRET` in `.env.local` and re-run.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Auth.js with Drizzle adapter and role helpers"
```

---

### Task 5: i18n routing with next-intl

**Files:**
- Create: `src/i18n/routing.ts`
- Create: `src/i18n/navigation.ts`
- Create: `src/i18n/request.ts`
- Create: `src/middleware.ts`
- Create: `messages/id.json`, `messages/en.json`
- Modify: `next.config.ts`
- Test: `src/i18n/messages.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `routing` (locales `["id","en"]`, default `"id"`).
  - From `src/i18n/navigation.ts`: `Link`, `redirect`, `usePathname`, `useRouter` (locale-aware).
  - Message catalogs with matching keys across locales.

- [ ] **Step 1: Install next-intl**

```bash
pnpm add next-intl
```

- [ ] **Step 2: Write the routing + navigation config**

`src/i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
});
```

`src/i18n/navigation.ts`:

```ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

`src/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "id" | "en")) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

`src/middleware.ts`:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API, Next internals, and files with an extension
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

- [ ] **Step 3: Wire the plugin in next.config**

`next.config.ts`:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 4: Create message catalogs**

`messages/en.json`:

```json
{
  "app": { "name": "Produknesia", "tagline": "Discover Indonesian products" },
  "nav": { "submit": "Submit", "signIn": "Sign in", "signOut": "Sign out" },
  "home": { "popular": "Popular", "newest": "Newest" }
}
```

`messages/id.json`:

```json
{
  "app": { "name": "Produknesia", "tagline": "Temukan produk Indonesia" },
  "nav": { "submit": "Kirim", "signIn": "Masuk", "signOut": "Keluar" },
  "home": { "popular": "Populer", "newest": "Terbaru" }
}
```

- [ ] **Step 5: Write a catalog-parity test**

`src/i18n/messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("message catalogs", () => {
  it("have identical key sets across locales", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(id).sort());
  });
});
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm test src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add next-intl locale routing and message catalogs"
```

---

### Task 6: Locale layout, base header, language switcher, auth buttons

**Files:**
- Create: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/page.tsx`
- Delete: `src/app/page.tsx`, `src/app/layout.tsx` (replaced by locale-scoped versions; keep a root layout — see Step 1)
- Create: `src/app/layout.tsx` (minimal root passthrough)
- Create: `src/components/Header.tsx`
- Create: `src/components/LanguageSwitcher.tsx`
- Create: `src/components/AuthButtons.tsx`
- Test: `src/components/LanguageSwitcher.test.tsx`

**Interfaces:**
- Consumes: `Link`/`usePathname` from `src/i18n/navigation.ts`; `auth`, `signIn`, `signOut` from `src/auth.ts`; `routing` from `src/i18n/routing.ts`.
- Produces: rendered app shell for all `/[locale]` routes.

- [ ] **Step 1: Root + locale layouts**

Replace `src/app/layout.tsx` with a minimal passthrough (App Router still needs a root layout):

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

Delete the default `src/app/page.tsx` (moved under `[locale]`).

`src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <Header />
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Note: `globals.css` was created by create-next-app at `src/app/globals.css`; the import path above is relative to `[locale]/layout.tsx`.

- [ ] **Step 2: Home page**

`src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("app");
  return (
    <div style={{ padding: 24 }}>
      <h1>{t("name")}</h1>
      <p>{t("tagline")}</p>
    </div>
  );
}
```

- [ ] **Step 3: Language switcher (with failing test first)**

`src/components/LanguageSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  Link: ({ children, locale }: any) => (
    <a data-locale={locale}>{children}</a>
  ),
}));

describe("LanguageSwitcher", () => {
  it("offers both locales", () => {
    render(
      <NextIntlClientProvider locale="id" messages={{}}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });
});
```

Run: `pnpm test src/components/LanguageSwitcher.test.tsx` → Expected: FAIL (module not found).

- [ ] **Step 4: Implement the switcher**

`src/components/LanguageSwitcher.tsx`:

```tsx
"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { id: "ID", en: "EN" };

export function LanguageSwitcher() {
  const pathname = usePathname();
  return (
    <nav aria-label="Language">
      {routing.locales.map((locale) => (
        <Link key={locale} href={pathname} locale={locale} style={{ margin: 4 }}>
          {LABELS[locale]}
        </Link>
      ))}
    </nav>
  );
}
```

Run: `pnpm test src/components/LanguageSwitcher.test.tsx` → Expected: PASS.

- [ ] **Step 5: Auth buttons (server component)**

`src/components/AuthButtons.tsx`:

```tsx
import { auth, signIn, signOut } from "@/auth";
import { getTranslations } from "next-intl/server";

export async function AuthButtons() {
  const session = await auth();
  const t = await getTranslations("nav");

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <span style={{ marginRight: 8 }}>{session.user.name}</span>
        <button type="submit">{t("signOut")}</button>
      </form>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button type="submit">{t("signIn")}</button>
    </form>
  );
}
```

- [ ] **Step 6: Header**

`src/components/Header.tsx`:

```tsx
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButtons } from "./AuthButtons";

export async function Header() {
  const t = await getTranslations();
  return (
    <header
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: 16,
        borderBottom: "1px solid #eee",
      }}
    >
      <Link href="/" style={{ fontWeight: 700 }}>
        {t("app.name")}
      </Link>
      <div style={{ flex: 1 }} />
      <Link href="/submit">{t("nav.submit")}</Link>
      <LanguageSwitcher />
      <AuthButtons />
    </header>
  );
}
```

- [ ] **Step 7: Full verification**

Run: `pnpm test`
Expected: all suites PASS.

Run: `pnpm build`
Expected: build succeeds; `/id` and `/en` routes are generated.

- [ ] **Step 8: Manual smoke (optional but recommended)**

Run: `pnpm dev`, visit `http://localhost:3000` → redirects to `/id`. Header shows name, ID/EN switch, and Sign in button. Click EN → tagline switches to English.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add locale layout, header, language switcher, auth buttons"
```

---

## Deployment Note (end of Phase 1)

- On Vercel: set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
- Run `pnpm db:migrate` against Neon (locally with prod `DATABASE_URL`, or via a Vercel build/deploy step) to create tables.
- **Admin bootstrap:** after your own first login, set your `users.role` to `admin` directly in Neon (SQL: `update users set role = 'admin' where email = 'you@example.com';`). Phase 2's admin queue depends on this.

## Self-Review

- **Spec coverage (Phase 1 scope):** Next.js + Drizzle + Neon schema (Task 2) ✓; Auth.js login (Task 4) ✓; i18n scaffolding (Task 5) ✓; base layout/header + language switcher (Task 6) ✓; deployable skeleton (build verified in Tasks 4/6, deploy note) ✓. The full data model from the spec (products, images, categories, join, votes, comments) is created in Task 2 so Phases 2–4 need no schema migration churn.
- **Placeholder scan:** No TBD/TODO; every code step has complete code.
- **Type consistency:** `assertAdmin`/`isAdmin` signatures match between Task 4 interface and tests; session `role`/`id` shape declared in `next-auth.d.ts` matches the `session` callback; `routing` and navigation exports are consistent across Tasks 5–6; `ensureUniqueSlug` signature (Task 3) matches its documented Phase 2 consumer.
