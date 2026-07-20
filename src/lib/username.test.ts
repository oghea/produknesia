import { describe, it, expect } from "vitest";
import { usernameBase } from "./username";

describe("usernameBase", () => {
  it("slugifies the name", () => {
    expect(usernameBase("Prayoga Antara", "x@y.z")).toBe("prayoga-antara");
  });
  it("falls back to the email local part", () => {
    expect(usernameBase(null, "budi.s@example.com")).toBe("budis");
    expect(usernameBase("!!!", "budi.s@example.com")).toBe("budis");
  });
  it("falls back to 'user' when nothing usable", () => {
    expect(usernameBase(null, null)).toBe("user");
    expect(usernameBase("!!!", "!!!@x.y")).toBe("user");
  });
  it("caps the base at 30 chars", () => {
    expect(usernameBase("a".repeat(50), null)).toHaveLength(30);
  });
});
