import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  boolean,
  uniqueIndex,
  index,
  jsonb,
  type AnyPgColumn,
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
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
    userIdx: index("accounts_user_idx").on(t.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

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
export const products = pgTable(
  "products",
  {
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
    launchedAt: timestamp("launched_at", { withTimezone: true, mode: "date" }),
    voteCount: integer("vote_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusVoteIdx: index("products_status_vote_idx").on(t.status, t.voteCount),
    statusLaunchedIdx: index("products_status_launched_idx").on(
      t.status,
      t.launchedAt,
    ),
    makerIdx: index("products_maker_idx").on(t.makerId),
  }),
);

export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    productIdx: index("product_images_product_idx").on(t.productId),
  }),
);

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
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.categoryId] }),
    categoryIdx: index("product_categories_category_idx").on(t.categoryId),
  }),
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqUserProduct: uniqueIndex("votes_user_product_uniq").on(
      t.productId,
      t.userId,
    ),
    userIdx: index("votes_user_idx").on(t.userId),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(
      (): AnyPgColumn => comments.id,
      { onDelete: "cascade" },
    ),
    body: text("body").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    productIdx: index("comments_product_idx").on(t.productId),
    parentIdx: index("comments_parent_idx").on(t.parentId),
  }),
);

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
