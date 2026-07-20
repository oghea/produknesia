import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, "validation.tooLong").optional(),
  );

export const productInputSchema = z
  .object({
    name: z
      .string("validation.nameRequired")
      .trim()
      .min(3, "validation.nameTooShort")
      .max(80, "validation.nameTooLong"),
    taglineId: optionalText(140),
    taglineEn: optionalText(140),
    descriptionId: optionalText(5000),
    descriptionEn: optionalText(5000),
    websiteUrl: z
      .string("validation.urlInvalid")
      .trim()
      .url("validation.urlInvalid")
      .max(300, "validation.tooLong")
      .refine((v) => /^https?:\/\//i.test(v), "validation.urlInvalid"),
    categoryIds: z
      .array(z.string())
      .min(1, "validation.categoryRequired")
      .max(3, "validation.categoryTooMany"),
  })
  .refine((d) => d.taglineId || d.taglineEn, {
    message: "validation.taglineRequired",
    path: ["taglineId"],
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const commentInputSchema = z.object({
  body: z
    .string("validation.commentRequired")
    .trim()
    .min(1, "validation.commentRequired")
    .max(2000, "validation.commentTooLong"),
});

export function parseCommentForm(
  formData: FormData,
):
  | { ok: true; data: { body: string } }
  | { ok: false; errors: Record<string, string> } {
  const result = commentInputSchema.safeParse({
    body: formData.get("body") ?? undefined,
  });
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export function parseProductForm(
  formData: FormData,
):
  | { ok: true; data: ProductInput }
  | { ok: false; errors: Record<string, string> } {
  const raw = {
    name: formData.get("name") ?? undefined,
    taglineId: formData.get("taglineId") ?? undefined,
    taglineEn: formData.get("taglineEn") ?? undefined,
    descriptionId: formData.get("descriptionId") ?? undefined,
    descriptionEn: formData.get("descriptionEn") ?? undefined,
    websiteUrl: formData.get("websiteUrl") ?? undefined,
    categoryIds: formData.getAll("categoryIds").map(String),
  };
  const result = productInputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
