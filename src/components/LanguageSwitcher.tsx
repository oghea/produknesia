"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const LABELS: Record<(typeof routing.locales)[number], string> = {
  id: "ID",
  en: "EN",
};

export function LanguageSwitcher() {
  const pathname = usePathname();
  const active = useLocale();
  const t = useTranslations("nav");
  return (
    <nav
      aria-label={t("languageLabel")}
      className="flex items-center rounded-md border p-0.5"
    >
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          className={cn(
            "rounded-[6px] px-2.5 py-1 text-sm font-medium transition-colors",
            locale === active
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[locale]}
        </Link>
      ))}
    </nav>
  );
}
