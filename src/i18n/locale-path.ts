import { routing } from "./routing";

/**
 * Build an absolute app path for a locale, honoring `localePrefix:
 * "as-needed"`: the default locale gets no prefix, others do.
 * Use in server actions/redirects where the locale-aware `Link`/`redirect`
 * from `@/i18n/navigation` isn't available.
 */
export function localePath(locale: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return locale === routing.defaultLocale
    ? normalized
    : `/${locale}${normalized}`;
}
