import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SearchForm } from "./SearchForm";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SearchForm", () => {
  it("renders a search input with the localized placeholder", () => {
    render(
      <NextIntlClientProvider
        locale="id"
        messages={{ search: { placeholder: "Cari produk…" } }}
      >
        <SearchForm />
      </NextIntlClientProvider>,
    );
    expect(screen.getByPlaceholderText("Cari produk…")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("prefills the initial query", () => {
    render(
      <NextIntlClientProvider
        locale="id"
        messages={{ search: { placeholder: "Cari produk…" } }}
      >
        <SearchForm initialQuery="kopi" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("kopi");
  });
});
