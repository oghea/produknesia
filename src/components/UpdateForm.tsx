"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  postUpdateAction,
  type UpdateState,
} from "@/app/[locale]/products/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: UpdateState = { ok: false, errors: {} };

function FieldError({ k }: { k?: string }) {
  const t = useTranslations();
  if (!k) return null;
  return <p className="text-sm text-destructive">{t(k)}</p>;
}

export function UpdateForm({
  productId,
  slug,
}: {
  productId: string;
  slug: string;
}) {
  const t = useTranslations("updates");
  const [state, formAction, pending] = useActionState(
    postUpdateAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="upd-version">{t("version")}</Label>
        <Input id="upd-version" name="version" placeholder="v1.2.0" />
        <FieldError k={state.errors.version} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="upd-title-id">{t("titleId")}</Label>
          <Input id="upd-title-id" name="titleId" />
          <FieldError k={state.errors.titleId} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="upd-title-en">{t("titleEn")}</Label>
          <Input id="upd-title-en" name="titleEn" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="upd-body-id">{t("bodyId")}</Label>
        <Textarea id="upd-body-id" name="bodyId" rows={5} />
        <FieldError k={state.errors.bodyId} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="upd-body-en">{t("bodyEn")}</Label>
        <Textarea id="upd-body-en" name="bodyEn" rows={5} />
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("pairHint")}</p>

      <FieldError k={state.errors.form} />

      <Button type="submit" disabled={pending} className="cursor-pointer">
        {pending && (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        )}
        {t("send")}
      </Button>
    </form>
  );
}
