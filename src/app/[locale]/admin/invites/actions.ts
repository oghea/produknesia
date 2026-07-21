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

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1) return { errors: { logo: "validation.logoSingle" } };
  if (screenshotFiles.length > 4) {
    return { errors: { screenshots: "validation.screenshotsTooMany" } };
  }
  const toValidate = [
    ...logoFiles.map((file) => ({ field: "logo" as const, file })),
    ...screenshotFiles.map((file) => ({ field: "screenshots" as const, file })),
  ];
  for (const { field, file } of toValidate) {
    const err = validateImage(file);
    if (err) return { errors: { [field]: err } };
  }

  let token: string;
  try {
    const logoUrl = logoFiles[0] ? await putImage(logoFiles[0]) : undefined;
    const screenshotUrls: string[] = [];
    for (const f of screenshotFiles) screenshotUrls.push(await putImage(f));

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
    return { errors: { form: "validation.formError" } };
  }

  revalidatePath("/", "layout");
  const locale = await getLocale();
  redirect(localePath(locale, `/admin/invites?created=${token}`));
}
