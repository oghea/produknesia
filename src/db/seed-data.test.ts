import { describe, it, expect } from "vitest";
import { CATEGORIES } from "./seed-data";

describe("CATEGORIES", () => {
  it("has at least 8 categories with unique slugs", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(slugs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("every category has both locale names", () => {
    for (const c of CATEGORIES) {
      expect(c.nameId.length).toBeGreaterThan(0);
      expect(c.nameEn.length).toBeGreaterThan(0);
    }
  });
});
