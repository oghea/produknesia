import { describe, it, expect } from "vitest";
import { parseProductForm } from "./validation";

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  return fd;
}

const valid = {
  name: "Kopi Kirim",
  taglineId: "Kirim kopi ke temanmu",
  websiteUrl: "https://kopikirim.id",
  categoryIds: ["cat1"],
};

describe("parseProductForm", () => {
  it("accepts a valid submission", () => {
    const r = parseProductForm(form(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Kopi Kirim");
      expect(r.data.taglineEn).toBeUndefined(); // empty -> undefined
    }
  });

  it("rejects a too-short name with an i18n key", () => {
    const r = parseProductForm(form({ ...valid, name: "ab" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBe("validation.nameTooShort");
  });

  it("requires at least one tagline", () => {
    const r = parseProductForm(form({ ...valid, taglineId: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.taglineId).toBe("validation.taglineRequired");
  });

  it("rejects an invalid URL", () => {
    const r = parseProductForm(form({ ...valid, websiteUrl: "not a url" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.websiteUrl).toBe("validation.urlInvalid");
  });

  it("requires at least one category", () => {
    const r = parseProductForm(form({ ...valid, categoryIds: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.categoryIds).toBe("validation.categoryRequired");
  });

  it("rejects more than three categories", () => {
    const r = parseProductForm(
      form({ ...valid, categoryIds: ["a", "b", "c", "d"] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.categoryIds).toBe("validation.categoryTooMany");
  });

  it("rejects non-http(s) URL schemes", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "vbscript:x",
      "ftp://example.com/x",
    ]) {
      const r = parseProductForm(form({ ...valid, websiteUrl: url }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.websiteUrl).toBe("validation.urlInvalid");
    }
  });

  it("accepts http and https URLs", () => {
    for (const url of ["https://produknesia.id", "http://localhost:3000/x"]) {
      expect(parseProductForm(form({ ...valid, websiteUrl: url })).ok).toBe(true);
    }
  });
});
