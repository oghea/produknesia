import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, "validation.tooLong").optional(),
  );

const taglineRefine = {
  check: (d: { taglineId?: string; taglineEn?: string }) =>
    Boolean(d.taglineId || d.taglineEn),
  opts: { message: "validation.taglineRequired", path: ["taglineId"] },
};

export const productObjectSchema = z.object({
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
});

export const productInputSchema = productObjectSchema.refine(
  taglineRefine.check,
  taglineRefine.opts,
);

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

export const updateInputSchema = z
  .object({
    version: optionalText(30),
    titleId: optionalText(120),
    titleEn: optionalText(120),
    bodyId: optionalText(5000),
    bodyEn: optionalText(5000),
  })
  .refine((d) => d.titleId || d.titleEn, {
    message: "validation.updateTitleRequired",
    path: ["titleId"],
  })
  .refine((d) => d.bodyId || d.bodyEn, {
    message: "validation.updateBodyRequired",
    path: ["bodyId"],
  });

export type UpdateFormData = z.infer<typeof updateInputSchema>;

export function parseUpdateForm(
  formData: FormData,
):
  | { ok: true; data: UpdateFormData }
  | { ok: false; errors: Record<string, string> } {
  const result = updateInputSchema.safeParse({
    version: formData.get("version") ?? undefined,
    titleId: formData.get("titleId") ?? undefined,
    titleEn: formData.get("titleEn") ?? undefined,
    bodyId: formData.get("bodyId") ?? undefined,
    bodyEn: formData.get("bodyEn") ?? undefined,
  });
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

const waitlistSchema = z.object({
  email: z
    .string("validation.emailInvalid")
    .trim()
    .toLowerCase()
    .email("validation.emailInvalid")
    .max(200, "validation.emailInvalid"),
});

export function parseWaitlistForm(
  formData: FormData,
): { ok: true; email: string } | { ok: false; errors: Record<string, string> } {
  const result = waitlistSchema.safeParse({
    email: formData.get("email") ?? undefined,
  });
  if (result.success) return { ok: true, email: result.data.email };
  return { ok: false, errors: { email: "validation.emailInvalid" } };
}

export const inviteDraftSchema = productObjectSchema
  .extend({
    logoUrl: z.string().optional(),
    screenshotUrls: z.array(z.string()).max(4, "validation.screenshotsTooMany"),
  })
  .refine(taglineRefine.check, taglineRefine.opts);

export type InviteDraft = z.infer<typeof inviteDraftSchema>;
