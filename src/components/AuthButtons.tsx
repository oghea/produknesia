import { getLocale, getTranslations } from "next-intl/server";
import { auth, signIn, signOut } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { PendingButton } from "./PendingButton";
import { UserMenu } from "./UserMenu";
import { localePath } from "@/i18n/locale-path";

export async function AuthButtons() {
  const session = await auth();
  const t = await getTranslations("nav");
  const locale = await getLocale();

  if (session?.user) {
    return (
      <UserMenu
        name={session.user.name ?? null}
        image={session.user.image ?? null}
        username={session.user.username}
        isAdmin={isAdmin(session)}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: localePath(locale, "/") });
        }}
      />
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: localePath(locale, "/") });
      }}
    >
      <PendingButton
        variant="outline"
        size="sm"
        className="cursor-pointer"
      >
        {t("signIn")}
      </PendingButton>
    </form>
  );
}
