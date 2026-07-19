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
