import { LogIn, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { Link } from "@/i18n/navigation";
import { localePath } from "@/i18n/locale-path";
import { countApprovedProducts } from "@/db/queries/products";
import { FadeUp } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";
import { WaitlistForm } from "@/components/WaitlistForm";
import { PendingButton } from "@/components/PendingButton";

export async function Landing() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const [session, count] = await Promise.all([
    auth(),
    countApprovedProducts(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <FadeUp>
        <Badge variant="outline" className="border-primary/40 text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("badge")}
        </Badge>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          {t("headline")}
        </h1>
      </FadeUp>

      <div className="mt-10 flex flex-col gap-5 text-lg leading-relaxed text-muted-foreground">
        <p>{t("beat1")}</p>
        <p className="text-foreground">{t("beat2")}</p>
        <p>{t("beat3")}</p>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        {session?.user ? (
          <p className="text-base font-medium">{t("alreadyIn")}</p>
        ) : (
          <>
            <WaitlistForm />
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: localePath(locale, "/") });
              }}
            >
              <PendingButton variant="outline" className="cursor-pointer">
                <LogIn className="size-4" aria-hidden="true" />
                {t("signInGoogle")}
              </PendingButton>
            </form>
          </>
        )}
      </div>

      <div className="mt-12 border-t pt-8">
        <Link
          href="/submit"
          className="cursor-pointer font-heading text-lg font-bold text-primary hover:underline"
        >
          {t("makerCta")}
        </Link>
        {count >= 10 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("proof", { count })}
          </p>
        )}
      </div>
    </div>
  );
}
