import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("app");
  return (
    <div style={{ padding: 24 }}>
      <h1>{t("name")}</h1>
      <p>{t("tagline")}</p>
    </div>
  );
}
