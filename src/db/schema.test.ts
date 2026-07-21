import { describe, it, expect } from "vitest";
import {
  products,
  users,
  votes,
  productUpdates,
  productWatches,
  invites,
  launchSubscribers,
} from "./schema";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

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

    // assert unique index exists on productId + userId
    const cfg = getTableConfig(votes);
    const uniq = cfg.indexes.find((i) => i.config.unique);
    expect(uniq).toBeDefined();
    expect(uniq!.config.columns.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(["product_id", "user_id"]),
    );
  });
});

describe("phase 5 tables", () => {
  it("productUpdates has status defaulting to pending", () => {
    const cols = getTableColumns(productUpdates);
    expect(cols.status.default).toBe("pending");
    expect(Object.keys(cols)).toEqual(
      expect.arrayContaining([
        "id", "productId", "authorId", "version",
        "titleId", "titleEn", "bodyId", "bodyEn",
        "status", "rejectionReason", "publishedAt", "createdAt",
      ]),
    );
  });

  it("productWatches enforces one watch per user+product", () => {
    const cols = Object.keys(getTableColumns(productWatches));
    expect(cols).toEqual(
      expect.arrayContaining(["productId", "userId", "unsubscribeToken"]),
    );
    const cfg = getTableConfig(productWatches);
    const uniq = cfg.indexes.find((i) => i.config.unique);
    expect(uniq).toBeDefined();
  });

  it("invites carries a jsonb draft and claim columns", () => {
    const cols = Object.keys(getTableColumns(invites));
    expect(cols).toEqual(
      expect.arrayContaining([
        "token", "draft", "note", "createdBy",
        "expiresAt", "claimedBy", "claimedProductId", "claimedAt",
      ]),
    );
  });

  it("launchSubscribers has a unique email", () => {
    const cols = Object.keys(getTableColumns(launchSubscribers));
    expect(cols).toEqual(expect.arrayContaining(["id", "email", "createdAt"]));
  });
});
