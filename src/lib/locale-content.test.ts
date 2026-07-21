import { describe, it, expect } from "vitest";
import { pickLocalized, pickLocalizedPair } from "./locale-content";

const row = {
  taglineId: "Kirim kopi",
  taglineEn: null,
  descriptionId: null,
  descriptionEn: "An English description",
};

describe("pickLocalized", () => {
  it("prefers the viewer locale", () => {
    expect(pickLocalized(row, "id").tagline).toBe("Kirim kopi");
    expect(pickLocalized(row, "en").description).toBe(
      "An English description",
    );
  });
  it("falls back to the other locale when missing", () => {
    expect(pickLocalized(row, "en").tagline).toBe("Kirim kopi");
    expect(pickLocalized(row, "id").description).toBe(
      "An English description",
    );
  });
  it("returns null when neither exists", () => {
    expect(
      pickLocalized(
        { taglineId: null, taglineEn: null, descriptionId: null, descriptionEn: null },
        "id",
      ).tagline,
    ).toBeNull();
  });
});

describe("pickLocalizedPair", () => {
  it("prefers the viewer locale and falls back", () => {
    expect(pickLocalizedPair("halo", null, "en")).toBe("halo");
    expect(pickLocalizedPair("halo", "hello", "en")).toBe("hello");
    expect(pickLocalizedPair(null, "hello", "id")).toBe("hello");
    expect(pickLocalizedPair(null, null, "id")).toBeNull();
  });
});
