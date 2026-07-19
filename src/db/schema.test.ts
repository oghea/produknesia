import { describe, it, expect } from "vitest";
import { products, users, votes } from "./schema";
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
