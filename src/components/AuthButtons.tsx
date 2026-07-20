import { auth, signIn, signOut } from "@/auth";
import { getLocale, getTranslations } from "next-intl/server";

export async function AuthButtons() {
  const session = await auth();
  const t = await getTranslations("nav");
  const locale = await getLocale();

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: `/${locale}` });
        }}
      >
        <span style={{ marginRight: 8 }}>{session.user.name}</span>
        <button type="submit">{t("signOut")}</button>
      </form>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: `/${locale}` });
      }}
    >
      <button type="submit">{t("signIn")}</button>
    </form>
  );
}
