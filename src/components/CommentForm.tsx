"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  addCommentAction,
  type CommentState,
} from "@/app/[locale]/products/[slug]/actions";

const initialState: CommentState = { ok: false, errors: {} };

export function CommentForm({
  productId,
  slug,
  parentId,
}: {
  productId: string;
  slug: string;
  parentId?: string;
}) {
  const t = useTranslations();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    addCommentAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="body"
        rows={parentId ? 2 : 3}
        placeholder={t("comments.placeholder")}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
      />
      {state.errors.body && (
        <p className="text-sm text-red-600">{t(state.errors.body)}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {parentId ? t("comments.reply") : t("comments.send")}
      </button>
    </form>
  );
}
