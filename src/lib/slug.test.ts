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
  it("strips leading and trailing hyphens", () => {
    expect(slugify("- Kaos Anak -")).toBe("kaos-anak");
  });
  it("strips diacritics to ascii", () => {
    expect(slugify("Café Kopi")).toBe("cafe-kopi");
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
