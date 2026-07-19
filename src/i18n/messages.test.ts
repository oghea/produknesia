import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("message catalogs", () => {
  it("have identical key sets across locales", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(id).sort());
  });
});
