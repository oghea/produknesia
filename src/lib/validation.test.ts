import { describe, it, expect } from "vitest";
import { parseProductForm, parseCommentForm } from "./validation";

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

describe("parseCommentForm", () => {
  it("accepts a normal body and trims it", () => {
    const fd = new FormData();
    fd.append("body", "  Mantap!  ");
    const r = parseCommentForm(fd);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.body).toBe("Mantap!");
  });

  it("rejects an empty body", () => {
    const fd = new FormData();
    fd.append("body", "   ");
    const r = parseCommentForm(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBe("validation.commentRequired");
  });

  it("rejects a missing body", () => {
    const r = parseCommentForm(new FormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBe("validation.commentRequired");
  });

  it("rejects an over-long body", () => {
    const fd = new FormData();
    fd.append("body", "x".repeat(2001));
    const r = parseCommentForm(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.body).toBe("validation.commentTooLong");
  });
});

import { parseUpdateForm, inviteDraftSchema } from "./validation";

describe("parseUpdateForm", () => {
  function updForm(entries: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.append(k, v);
    return fd;
  }

  it("accepts version + one-language title/body", () => {
    const r = parseUpdateForm(
      updForm({ version: "v1.2.0", titleId: "Fitur baru", bodyId: "Detail…" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.version).toBe("v1.2.0");
      expect(r.data.titleEn).toBeUndefined();
    }
  });

  it("accepts a missing version", () => {
    expect(
      parseUpdateForm(updForm({ titleEn: "New", bodyEn: "Details" })).ok,
    ).toBe(true);
  });

  it("requires at least one title", () => {
    const r = parseUpdateForm(updForm({ bodyId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.titleId).toBe("validation.updateTitleRequired");
  });

  it("requires at least one body", () => {
    const r = parseUpdateForm(updForm({ titleId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.bodyId).toBe("validation.updateBodyRequired");
  });

  it("rejects an over-long version", () => {
    const r = parseUpdateForm(
      updForm({ version: "v".repeat(31), titleId: "x", bodyId: "y" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.version).toBe("validation.tooLong");
  });
});

describe("inviteDraftSchema", () => {
  const base = {
    name: "Kopi Kirim",
    taglineId: "Kirim kopi",
    websiteUrl: "https://kopikirim.id",
    categoryIds: ["cat1"],
    screenshotUrls: [],
  };

  it("accepts a valid draft with images", () => {
    const r = inviteDraftSchema.safeParse({
      ...base,
      logoUrl: "/uploads/a.png",
      screenshotUrls: ["/uploads/b.png"],
    });
    expect(r.success).toBe(true);
  });

  it("applies the same product rules (scheme check)", () => {
    const r = inviteDraftSchema.safeParse({
      ...base,
      websiteUrl: "javascript:alert(1)",
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 4 screenshots", () => {
    const r = inviteDraftSchema.safeParse({
      ...base,
      screenshotUrls: ["a", "b", "c", "d", "e"],
    });
    expect(r.success).toBe(false);
  });
});
