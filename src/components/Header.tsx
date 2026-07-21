import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { isComingSoon } from "@/lib/launch";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButtons } from "./AuthButtons";
import { SearchForm } from "./SearchForm";
import { ThemeToggle } from "./ThemeToggle";

export async function Header() {
  const t = await getTranslations();
  const session = await auth();
  const hideCatalog = isComingSoon() && !isAdmin(session);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-2.5 px-4 sm:gap-3.5 sm:px-6">
        <Link
          href="/"
          className="shrink-0 font-heading text-2xl font-extrabold lowercase tracking-tight"
          aria-label={t("app.name")}
        >
          {t("app.name").toLowerCase()}
          <span className="text-primary">.</span>
        </Link>

        <div className="flex-1" />

        {!hideCatalog && <SearchForm />}

        <Button
          size="sm"
          nativeButton={false}
          className="cursor-pointer"
          render={<Link href="/submit" />}
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t("nav.submit")}</span>
        </Button>

        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>
        <ThemeToggle />
        <AuthButtons />
      </div>
    </header>
  );
}
