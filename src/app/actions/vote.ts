"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { toggleVote, type VoteResult } from "@/db/queries/votes";
import { localePath } from "@/i18n/locale-path";

export async function voteAction(
  productId: string,
  currentPath: string,
): Promise<VoteResult | null> {
  const session = await auth();
  if (!session?.user) {
    const locale = await getLocale();
    // Guests are prompted to sign in, then land back where they were.
    await signIn("google", { redirectTo: localePath(locale, currentPath) });
    return null; // unreachable — signIn redirects — but satisfies the type
  }
  const result = await toggleVote(productId, session.user.id);
  // High-frequency action: refresh only the page the voter is on. Every
  // page is dynamically rendered, so other routes pick the count up on
  // their next visit anyway.
  const locale = await getLocale();
  revalidatePath(localePath(locale, currentPath));
  return result;
}
