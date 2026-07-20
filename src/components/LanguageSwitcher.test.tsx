import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  Link: ({ children, locale }: any) => (
    <a data-locale={locale}>{children}</a>
  ),
}));

describe("LanguageSwitcher", () => {
  it("offers both locales", () => {
    render(
      <NextIntlClientProvider locale="id" messages={{ nav: { languageLabel: "Bahasa" } }}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });
});
