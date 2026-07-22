"use server";

import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { isComingSoon } from "@/lib/launch";
import { listFeedPage } from "@/db/queries/products";
import { serializeFeedItems, type DigestItem } from "@/lib/feed-serialize";

export async function loadMoreFeed(
  cursor: string,
): Promise<{ items: DigestItem[]; nextCursor: string | null }> {
  if (isComingSoon()) {
    const session = await auth();
    if (!isAdmin(session)) return { items: [], nextCursor: null };
  }
  const page = await listFeedPage(cursor);
  return { items: await serializeFeedItems(page.items), nextCursor: page.nextCursor };
}
