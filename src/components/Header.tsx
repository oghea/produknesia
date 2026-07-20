import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButtons } from "./AuthButtons";
import { SearchForm } from "./SearchForm";

export async function Header() {
  const t = await getTranslations();
  return (
    <header className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
      <Link href="/" className="font-bold">
        {t("app.name")}
      </Link>
      <div className="flex-1" />
      <SearchForm />
      <Link href="/submit" className="text-sm text-gray-700 hover:text-black">
        {t("nav.submit")}
      </Link>
      <LanguageSwitcher />
      <AuthButtons />
    </header>
  );
}
