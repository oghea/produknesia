import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { validateImage, putImage, MAX_IMAGE_BYTES } from "./storage";

describe("validateImage", () => {
  it("accepts jpeg/png/webp under the size cap", () => {
    expect(validateImage({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImage({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateImage({ type: "image/webp", size: 1000 })).toBeNull();
  });
  it("rejects other content types", () => {
    expect(validateImage({ type: "image/gif", size: 10 })).toBe(
      "validation.imageType",
    );
    expect(validateImage({ type: "text/html", size: 10 })).toBe(
      "validation.imageType",
    );
  });
  it("rejects oversized files", () => {
    expect(
      validateImage({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }),
    ).toBe("validation.imageSize");
  });
});

describe("putImage local fallback", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "storage-test-"));
    process.env.UPLOADS_BASE_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterEach(async () => {
    delete process.env.UPLOADS_BASE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the file and returns a /uploads path", async () => {
    const file = new File([Buffer.from("fake-png")], "logo.png", {
      type: "image/png",
    });
    const url = await putImage(file);
    expect(url).toMatch(/^\/uploads\/[A-Za-z0-9-]+\.png$/);
    const written = await readFile(path.join(dir, url));
    expect(written.toString()).toBe("fake-png");
  });

  it("throws the validation key for a bad type", async () => {
    const file = new File([Buffer.from("x")], "x.gif", { type: "image/gif" });
    await expect(putImage(file)).rejects.toThrow("validation.imageType");
  });
});
