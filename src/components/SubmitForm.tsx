"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitProduct, type SubmitState } from "@/app/[locale]/submit/actions";

const initialState: SubmitState = { errors: {} };

function FieldError({ k }: { k?: string }) {
  const t = useTranslations();
  if (!k) return null;
  return <p className="mt-1 text-sm text-red-600">{t(k)}</p>;
}

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-black focus:outline-none";

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
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className="block">
        <span className="font-medium">{t("name")}</span>
        <input name="name" required className={inputCls} />
        <FieldError k={state.errors.name} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">{t("taglineId")}</span>
          <input name="taglineId" className={inputCls} />
          <FieldError k={state.errors.taglineId} />
        </label>
        <label className="block">
          <span className="font-medium">{t("taglineEn")}</span>
          <input name="taglineEn" className={inputCls} />
        </label>
      </div>
      <p className="text-sm text-gray-500">{t("taglineHint")}</p>

      <label className="block">
        <span className="font-medium">{t("descriptionId")}</span>
        <textarea name="descriptionId" rows={5} className={inputCls} />
        <FieldError k={state.errors.descriptionId} />
      </label>
      <label className="block">
        <span className="font-medium">{t("descriptionEn")}</span>
        <textarea name="descriptionEn" rows={5} className={inputCls} />
      </label>

      <label className="block">
        <span className="font-medium">{t("website")}</span>
        <input
          name="websiteUrl"
          type="url"
          placeholder="https://"
          required
          className={inputCls}
        />
        <FieldError k={state.errors.websiteUrl} />
      </label>

      <fieldset>
        <legend className="font-medium">{t("categories")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categoryIds" value={c.id} />
              {c.label}
            </label>
          ))}
        </div>
        <FieldError k={state.errors.categoryIds} />
      </fieldset>

      <label className="block">
        <span className="font-medium">{t("logo")}</span>
        <input
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block"
        />
        <FieldError k={state.errors.logo} />
      </label>

      <label className="block">
        <span className="font-medium">{t("screenshots")}</span>
        <input
          name="screenshots"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="mt-1 block"
        />
        <FieldError k={state.errors.screenshots} />
      </label>

      <FieldError k={state.errors.form} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {t("send")}
      </button>
    </form>
  );
}
