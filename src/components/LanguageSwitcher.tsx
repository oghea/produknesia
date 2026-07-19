"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { id: "ID", en: "EN" };

export function LanguageSwitcher() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("languageLabel")}>
      {routing.locales.map((locale) => (
        <Link key={locale} href={pathname} locale={locale} style={{ margin: 4 }}>
          {LABELS[locale]}
        </Link>
      ))}
    </nav>
  );
}
