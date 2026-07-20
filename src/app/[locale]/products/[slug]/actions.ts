"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { parseCommentForm } from "@/lib/validation";
import { createComment, softDeleteComment } from "@/db/queries/comments";
import { localePath } from "@/i18n/locale-path";

export type CommentState = { ok: boolean; errors: Record<string, string> };

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

  const parsed = parseCommentForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const productId = String(formData.get("productId") ?? "");
  const parentIdRaw = String(formData.get("parentId") ?? "");
  const created = await createComment({
    productId,
    userId: session.user.id,
    body: parsed.data.body,
    parentId: parentIdRaw || undefined,
  });
  if (!created) return { ok: false, errors: { body: "validation.formError" } };

  revalidatePath("/", "layout");
  return { ok: true, errors: {} };
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const commentId = String(formData.get("commentId") ?? "");
  if (!commentId) return;
  await softDeleteComment(commentId, session.user.id, isAdmin(session));
  revalidatePath("/", "layout");
}
