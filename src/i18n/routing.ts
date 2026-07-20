import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  // Root paths serve Indonesian without a /id prefix; only /en/* is prefixed.
  localePrefix: "as-needed",
  // Never bounce first-time visitors to /en based on browser language —
  // the root is always Indonesian; EN is an explicit choice via the switcher.
  localeDetection: false,
});
