"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { submitProduct, type SubmitState } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: SubmitState = { errors: {} };

function FieldError({ k }: { k?: string }) {
  const t = useTranslations();
  if (!k) return null;
  return <p className="text-sm text-destructive">{t(k)}</p>;
}

export function SubmitForm({
  categories,
}: {
  categories: { id: string; label: string }[];
}) {
  const t = useTranslations("submit");
  const [state, formAction, pending] = useActionState(
    submitProduct,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-name">{t("name")}</Label>
        <Input id="submit-name" name="name" required />
        <FieldError k={state.errors.name} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="submit-tagline-id">{t("taglineId")}</Label>
          <Input id="submit-tagline-id" name="taglineId" />
          <FieldError k={state.errors.taglineId} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="submit-tagline-en">{t("taglineEn")}</Label>
          <Input id="submit-tagline-en" name="taglineEn" />
        </div>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("taglineHint")}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-desc-id">{t("descriptionId")}</Label>
        <Textarea id="submit-desc-id" name="descriptionId" rows={5} />
        <FieldError k={state.errors.descriptionId} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-desc-en">{t("descriptionEn")}</Label>
        <Textarea id="submit-desc-en" name="descriptionEn" rows={5} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-website">{t("website")}</Label>
        <Input
          id="submit-website"
          name="websiteUrl"
          type="url"
          placeholder="https://"
          required
        />
        <FieldError k={state.errors.websiteUrl} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t("categories")}</legend>
        <Card className="mt-2 py-0 shadow-none">
          <CardContent className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3">
            {categories.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={c.id}
                  className="size-4 accent-primary"
                />
                {c.label}
              </label>
            ))}
          </CardContent>
        </Card>
        <FieldError k={state.errors.categoryIds} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-logo">{t("logo")}</Label>
        <Input
          id="submit-logo"
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
        />
        <FieldError k={state.errors.logo} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="submit-screenshots">{t("screenshots")}</Label>
        <Input
          id="submit-screenshots"
          name="screenshots"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
        />
        <FieldError k={state.errors.screenshots} />
      </div>

      <FieldError k={state.errors.form} />

      <Button type="submit" variant="sticker" disabled={pending} className="cursor-pointer">
        {pending && (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        )}
        {t("send")}
      </Button>
    </form>
  );
}
