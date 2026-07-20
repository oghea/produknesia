import { getLocale, getTranslations } from "next-intl/server";
import { auth, signIn, signOut } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./UserMenu";

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
          await signOut({ redirectTo: `/${locale}` });
        }}
      />
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: `/${locale}` });
      }}
    >
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="cursor-pointer"
      >
        {t("signIn")}
      </Button>
    </form>
  );
}
