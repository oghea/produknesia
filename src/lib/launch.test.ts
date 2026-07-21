import { describe, it, expect, afterEach } from "vitest";
import { isComingSoon } from "./launch";

afterEach(() => {
  delete process.env.LAUNCH_MODE;
});

describe("isComingSoon", () => {
  it("is true only for the exact coming_soon value", () => {
    process.env.LAUNCH_MODE = "coming_soon";
    expect(isComingSoon()).toBe(true);
    process.env.LAUNCH_MODE = "live";
    expect(isComingSoon()).toBe(false);
    delete process.env.LAUNCH_MODE;
    expect(isComingSoon()).toBe(false);
  });
});
