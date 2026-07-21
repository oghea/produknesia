"use server";

import { auth } from "@/auth";
import {
  listFeedPage,
  type FeedItem,
} from "@/db/queries/products";
import { getVotedProductIds } from "@/db/queries/votes";

export type DigestItem = Omit<FeedItem, "launchedAt"> & {
  launchedAt: string | null;
  viewerVoted: boolean;
};

export async function serializeFeedItems(
  items: FeedItem[],
): Promise<DigestItem[]> {
  const session = await auth();
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();
  return items.map((i) => ({
    ...i,
    launchedAt: i.launchedAt ? i.launchedAt.toISOString() : null,
    viewerVoted: votedIds.has(i.id),
  }));
}

export async function loadMoreFeed(
  cursor: string,
): Promise<{ items: DigestItem[]; nextCursor: string | null }> {
  const page = await listFeedPage(cursor);
  return { items: await serializeFeedItems(page.items), nextCursor: page.nextCursor };
}
