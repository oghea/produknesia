import { CheckCircle2, LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { Link } from "@/i18n/navigation";
import { listCategories } from "@/db/queries/categories";
import { SubmitForm } from "@/components/SubmitForm";
import { FadeUp } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/PendingButton";
import { localePath } from "@/i18n/locale-path";

export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { locale } = await params;
  const { ok } = await searchParams;
  const t = await getTranslations();
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <FadeUp>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            {t("submit.title")}
          </h1>
          <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {t("submit.signInFirst")}
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: localePath(locale, "/submit") });
              }}
            >
              <PendingButton className="cursor-pointer">
                <LogIn className="size-4" aria-hidden="true" />
                {t("nav.signIn")}
              </PendingButton>
            </form>
          </div>
        </FadeUp>
      </div>
    );
  }

  if (ok === "1") {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <FadeUp>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            {t("submit.title")}
          </h1>
          <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-chart-3/40 bg-chart-3/10 p-10 text-center">
            <CheckCircle2
              className="size-8 text-chart-3"
              aria-hidden="true"
            />
            <p className="text-sm">{t("submit.success")}</p>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              nativeButton={false}
              render={<Link href="/" />}
            >
              {t("app.name")} →
            </Button>
          </div>
        </FadeUp>
      </div>
    );
  }

  const cats = await listCategories();
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t("submit.title")}</h1>
        <SubmitForm categories={catOptions} />
      </FadeUp>
    </div>
  );
}
