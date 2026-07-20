"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { parseProductForm } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { createProduct } from "@/db/queries/products";

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
  if (!session?.user) redirect(`/${locale}/submit`);

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" } };
  }
  for (const f of [...logoFiles, ...screenshotFiles]) {
    const err = validateImage(f);
    if (err) return { errors: { [f === logoFiles[0] ? "logo" : "screenshots"]: err } };
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

  redirect(`/${locale}/submit?ok=1`);
}
