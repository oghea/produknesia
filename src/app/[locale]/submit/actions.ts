"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { parseProductForm } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { createProduct } from "@/db/queries/products";
import { localePath } from "@/i18n/locale-path";
import {
  submittedProductValues,
  type SubmitValues,
} from "@/lib/form-values";

export type SubmitState = {
  errors: Record<string, string>;
  values?: SubmitValues;
};

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

  const values = submittedProductValues(formData);
  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1) {
    return { errors: { logo: "validation.logoSingle" }, values };
  }
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" }, values };
  }
  const toValidate: Array<{ field: "logo" | "screenshots"; file: File }> = [
    ...logoFiles.map((file) => ({ field: "logo" as const, file })),
    ...screenshotFiles.map((file) => ({ field: "screenshots" as const, file })),
  ];
  for (const { field, file } of toValidate) {
    const err = validateImage(file);
    if (err) return { errors: { [field]: err }, values };
  }

  try {
    const [logoUrl, screenshotUrls] = await Promise.all([
      logoFiles[0] ? putImage(logoFiles[0]) : undefined,
      Promise.all(screenshotFiles.map((f) => putImage(f))),
    ]);

    await createProduct({
      ...parsed.data,
      logoUrl,
      screenshotUrls,
      makerId: session.user.id,
    });
  } catch {
    return { errors: { form: "validation.formError" }, values };
  }

  redirect(localePath(locale, "/submit?ok=1"));
}
