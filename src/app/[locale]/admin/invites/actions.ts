"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { assertAdmin } from "@/auth-helpers";
import { localePath } from "@/i18n/locale-path";
import { parseProductForm, inviteDraftSchema } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { createInvite } from "@/db/queries/invites";
import type { SubmitState } from "@/app/[locale]/submit/actions";
import { submittedProductValues } from "@/lib/form-values";

function pickFiles(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function createInviteAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await auth();
  assertAdmin(session);

  const values = submittedProductValues(formData);
  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1)
    return { errors: { logo: "validation.logoSingle" }, values };
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" }, values };
  }
  const toValidate = [
    ...logoFiles.map((file) => ({ field: "logo" as const, file })),
    ...screenshotFiles.map((file) => ({ field: "screenshots" as const, file })),
  ];
  for (const { field, file } of toValidate) {
    const err = validateImage(file);
    if (err) return { errors: { [field]: err }, values };
  }

  let token: string;
  try {
    const [logoUrl, screenshotUrls] = await Promise.all([
      logoFiles[0] ? putImage(logoFiles[0]) : undefined,
      Promise.all(screenshotFiles.map((f) => putImage(f))),
    ]);

    const draft = inviteDraftSchema.parse({
      ...parsed.data,
      logoUrl,
      screenshotUrls,
    });
    const note = String(formData.get("note") ?? "").trim() || undefined;
    const invite = await createInvite({
      draft,
      note,
      createdBy: session.user.id,
    });
    token = invite.token;
  } catch {
    return { errors: { form: "validation.formError" }, values };
  }

  revalidatePath("/", "layout");
  const locale = await getLocale();
  redirect(localePath(locale, `/admin/invites?created=${token}`));
}
