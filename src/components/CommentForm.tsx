"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  addCommentAction,
  type CommentState,
} from "@/app/[locale]/products/[slug]/actions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
      <Textarea
        name="body"
        rows={parentId ? 2 : 3}
        placeholder={t("comments.placeholder")}
        aria-label={t("comments.placeholder")}
        defaultValue={state.ok ? undefined : state.values?.body}
      />
      {state.errors.body && (
        <p className="text-sm text-destructive">{t(state.errors.body)}</p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        className="cursor-pointer self-end"
      >
        {pending && (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        )}
        {parentId ? t("comments.reply") : t("comments.send")}
      </Button>
    </form>
  );
}
