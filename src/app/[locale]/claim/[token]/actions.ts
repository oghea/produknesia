"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { localePath } from "@/i18n/locale-path";
import { parseProductForm, inviteDraftSchema } from "@/lib/validation";
import { putImage, validateImage } from "@/lib/storage";
import { claimInvite, getOpenInviteByToken } from "@/db/queries/invites";
import type { SubmitState } from "@/app/[locale]/submit/actions";
import { submittedProductValues } from "@/lib/form-values";

function pickFiles(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function claimAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const token = String(formData.get("inviteToken") ?? "");
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) {
    await signIn("google", {
      redirectTo: localePath(locale, `/claim/${token}`),
    });
    return { errors: {} }; // unreachable — signIn redirects
  }

  const values = submittedProductValues(formData);
  const invite = await getOpenInviteByToken(token);
  if (!invite) return { errors: { form: "validation.formError" }, values };
  const draftParsed = inviteDraftSchema.safeParse(invite.draft);
  if (!draftParsed.success) return { errors: { form: "validation.formError" }, values };
  const draft = draftParsed.data;

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const logoFiles = pickFiles(formData, "logo");
  const screenshotFiles = pickFiles(formData, "screenshots");
  if (logoFiles.length > 1) return { errors: { logo: "validation.logoSingle" }, values };
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

  let slug: string;
  try {
    // New uploads replace the admin's images; otherwise keep the draft's.
    const logoUrl = logoFiles[0] ? await putImage(logoFiles[0]) : draft.logoUrl;
    const screenshotUrls =
      screenshotFiles.length > 0
        ? await Promise.all(screenshotFiles.map((f) => putImage(f)))
        : draft.screenshotUrls;

    const data = inviteDraftSchema.parse({
      ...parsed.data,
      logoUrl,
      screenshotUrls,
    });
    const result = await claimInvite({ token, userId: session.user.id, data });
    if (!result) return { errors: { form: "validation.formError" }, values };
    slug = result.slug;
  } catch {
    return { errors: { form: "validation.formError" }, values };
  }

  revalidatePath("/", "layout");
  redirect(localePath(locale, `/products/${slug}`));
}
