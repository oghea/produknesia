import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { listCategories } from "@/db/queries/categories";
import { SubmitForm } from "@/components/SubmitForm";

export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { locale } = await params;
  const { ok } = await searchParams;
  const t = await getTranslations("submit");
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-gray-600">{t("signInFirst")}</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/${locale}/submit` });
          }}
        >
          <button
            type="submit"
            className="mt-4 rounded-md bg-black px-4 py-2 text-white"
          >
            {t("signInFirst")}
          </button>
        </form>
      </div>
    );
  }

  if (ok === "1") {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 rounded-md bg-green-50 p-4 text-green-800">
          {t("success")}
        </p>
      </div>
    );
  }

  const cats = await listCategories();
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SubmitForm categories={catOptions} />
    </div>
  );
}
