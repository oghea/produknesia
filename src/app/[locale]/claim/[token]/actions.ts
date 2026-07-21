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

  const invite = await getOpenInviteByToken(token);
  if (!invite) return { errors: { form: "validation.formError" } };
  const draft = inviteDraftSchema.parse(invite.draft);

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
    if (!result) return { errors: { form: "validation.formError" } };
    slug = result.slug;
  } catch {
    return { errors: { form: "validation.formError" } };
  }

  revalidatePath("/", "layout");
  redirect(localePath(locale, `/products/${slug}`));
}
