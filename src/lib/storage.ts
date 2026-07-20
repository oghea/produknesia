import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { put } from "@vercel/blob";

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function validateImage(file: {
  type: string;
  size: number;
}): string | null {
  if (!(file.type in ALLOWED)) return "validation.imageType";
  if (file.size > MAX_IMAGE_BYTES) return "validation.imageSize";
  return null;
}

export async function putImage(file: File): Promise<string> {
  const error = validateImage(file);
  if (error) throw new Error(error);
  const name = `${randomUUID()}${ALLOWED[file.type]}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`products/${name}`, file, { access: "public" });
    return blob.url;
  }

  // Dev fallback: write under public/ so next dev serves it.
  const baseDir =
    process.env.UPLOADS_BASE_DIR ?? path.join(process.cwd(), "public");
  const rel = `/uploads/${name}`;
  const abs = path.join(baseDir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return rel;
}
