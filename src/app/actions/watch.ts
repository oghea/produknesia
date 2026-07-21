"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { localePath } from "@/i18n/locale-path";
import { toggleWatch } from "@/db/queries/watches";

export async function watchAction(
  productId: string,
  currentPath: string,
): Promise<{ watching: boolean } | null> {
  const session = await auth();
  if (!session?.user) {
    const locale = await getLocale();
    await signIn("google", { redirectTo: localePath(locale, currentPath) });
    return null; // unreachable — signIn redirects
  }
  const result = await toggleWatch(productId, session.user.id);
  const locale = await getLocale();
  revalidatePath(localePath(locale, currentPath));
  return result;
}
