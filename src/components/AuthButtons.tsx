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
        <span className="mr-2 text-sm">{session.user.name}</span>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          {t("signOut")}
        </button>
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
      <button
        type="submit"
        className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
      >
        {t("signIn")}
      </button>
    </form>
  );
}
