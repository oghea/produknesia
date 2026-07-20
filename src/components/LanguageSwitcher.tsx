"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<(typeof routing.locales)[number], string> = {
  id: "ID",
  en: "EN",
};

export function LanguageSwitcher() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("languageLabel")}>
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          className="mx-1 text-sm text-gray-600 hover:text-black"
        >
          {LABELS[locale]}
        </Link>
      ))}
    </nav>
  );
}
