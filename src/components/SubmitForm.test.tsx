import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SubmitForm } from "./SubmitForm";

vi.mock("@/app/[locale]/submit/actions", () => ({
  submitProduct: vi.fn(),
}));

const messages = {
  submit: {
    title: "t", signInFirst: "s", name: "Product name",
    taglineId: "Tagline (Indonesian)", taglineEn: "Tagline (English)",
    taglineHint: "hint", descriptionId: "d1", descriptionEn: "d2",
    website: "Website URL", categories: "Categories (up to 3)",
    logo: "Logo", screenshots: "Screenshots (up to 4)",
    send: "Submit for review", success: "ok",
  },
};

describe("SubmitForm defaults", () => {
  it("prefills fields and checks default categories", () => {
    render(
      <NextIntlClientProvider locale="id" messages={messages}>
        <SubmitForm
          categories={[
            { id: "c1", label: "AI" },
            { id: "c2", label: "SaaS" },
          ]}
          defaults={{
            name: "Kopi Kirim",
            websiteUrl: "https://kopikirim.id",
            categoryIds: ["c1"],
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Product name")).toHaveValue("Kopi Kirim");
    expect(screen.getByLabelText("Website URL")).toHaveValue(
      "https://kopikirim.id",
    );
    expect(screen.getByRole("checkbox", { name: "AI" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "SaaS" })).not.toBeChecked();
  });
});
