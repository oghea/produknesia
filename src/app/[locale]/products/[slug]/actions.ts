"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { parseCommentForm, parseUpdateForm } from "@/lib/validation";
import { createComment, softDeleteComment } from "@/db/queries/comments";
import { createUpdate } from "@/db/queries/updates";
import { localePath } from "@/i18n/locale-path";
import {
  submittedUpdateValues,
  type UpdateValues,
} from "@/lib/form-values";

export type CommentState = {
  ok: boolean;
  errors: Record<string, string>;
  values?: { body?: string };
};

export async function addCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const session = await auth();
  const slug = String(formData.get("slug") ?? "");
  if (!session?.user) {
    const locale = await getLocale();
    await signIn("google", { redirectTo: localePath(locale, `/products/${slug}`) });
    return { ok: false, errors: {} }; // unreachable — signIn redirects
  }

  const body = String(formData.get("body") ?? "");
  const parsed = parseCommentForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values: { body } };

  const productId = String(formData.get("productId") ?? "");
  const parentIdRaw = String(formData.get("parentId") ?? "");
  const created = await createComment({
    productId,
    userId: session.user.id,
    body: parsed.data.body,
    parentId: parentIdRaw || undefined,
  });
  if (!created)
    return {
      ok: false,
      errors: { body: "validation.formError" },
      values: { body },
    };

  const locale = await getLocale();
  revalidatePath(localePath(locale, `/products/${slug}`));
  return { ok: true, errors: {} };
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const commentId = String(formData.get("commentId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!commentId) return;
  await softDeleteComment(commentId, session.user.id, isAdmin(session));
  const locale = await getLocale();
  revalidatePath(localePath(locale, `/products/${slug}`));
}

export type UpdateState = {
  ok: boolean;
  errors: Record<string, string>;
  values?: UpdateValues;
};

export async function postUpdateAction(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const session = await auth();
  const slug = String(formData.get("slug") ?? "");
  if (!session?.user) {
    const locale = await getLocale();
    await signIn("google", {
      redirectTo: localePath(locale, `/products/${slug}/updates/new`),
    });
    return { ok: false, errors: {} }; // unreachable — signIn redirects
  }

  const values = submittedUpdateValues(formData);
  const parsed = parseUpdateForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };

  const productId = String(formData.get("productId") ?? "");
  const created = await createUpdate(
    { productId, authorId: session.user.id, ...parsed.data },
    isAdmin(session),
  );
  if (!created)
    return { ok: false, errors: { form: "validation.formError" }, values };

  const locale = await getLocale();
  revalidatePath(localePath(locale, `/products/${slug}`));
  redirect(localePath(locale, `/products/${slug}?update=1`));
}
