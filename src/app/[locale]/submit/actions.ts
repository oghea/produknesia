"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { parseProductForm } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { createProduct } from "@/db/queries/products";
import { localePath } from "@/i18n/locale-path";

export type SubmitState = { errors: Record<string, string> };

function pickFiles(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function submitProduct(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user) redirect(localePath(locale, "/submit"));

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1) {
    return { errors: { logo: "validation.logoSingle" } };
  }
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" } };
  }
  const toValidate: Array<{ field: "logo" | "screenshots"; file: File }> = [
    ...logoFiles.map((file) => ({ field: "logo" as const, file })),
    ...screenshotFiles.map((file) => ({ field: "screenshots" as const, file })),
  ];
  for (const { field, file } of toValidate) {
    const err = validateImage(file);
    if (err) return { errors: { [field]: err } };
  }

  try {
    const logoUrl = logoFiles[0] ? await putImage(logoFiles[0]) : undefined;
    const screenshotUrls: string[] = [];
    for (const f of screenshotFiles) screenshotUrls.push(await putImage(f));

    await createProduct({
      ...parsed.data,
      logoUrl,
      screenshotUrls,
      makerId: session.user.id,
    });
  } catch {
    return { errors: { form: "validation.formError" } };
  }

  redirect(localePath(locale, "/submit?ok=1"));
}
