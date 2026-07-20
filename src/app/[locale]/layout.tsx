import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { fontHeading, fontSans } from "@/lib/fonts";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${fontSans.variable} ${fontHeading.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <Providers>
            <Header />
            <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
