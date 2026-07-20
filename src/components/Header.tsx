import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButtons } from "./AuthButtons";
import { SearchForm } from "./SearchForm";
import { ThemeToggle } from "./ThemeToggle";

export async function Header() {
  const t = await getTranslations();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          aria-label={t("app.name")}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-heading text-lg font-bold text-primary-foreground">
            P
          </span>
          <span className="hidden font-heading text-lg font-bold sm:inline">
            {t("app.name")}
          </span>
        </Link>

        <div className="flex-1" />

        <SearchForm />

        <Button
          size="sm"
          className="cursor-pointer"
          nativeButton={false}
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
