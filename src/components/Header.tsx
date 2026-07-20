import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButtons } from "./AuthButtons";

export async function Header() {
  const t = await getTranslations();
  return (
    <header
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: 16,
        borderBottom: "1px solid #eee",
      }}
    >
      <Link href="/" style={{ fontWeight: 700 }}>
        {t("app.name")}
      </Link>
      <div style={{ flex: 1 }} />
      <Link href="/submit">{t("nav.submit")}</Link>
      <LanguageSwitcher />
      <AuthButtons />
    </header>
  );
}
