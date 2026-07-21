"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { loadMoreFeed, type DigestItem } from "@/app/actions/feed";
import { groupByLaunchDay } from "@/lib/feed-days";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DailyDigest({
  initialItems,
  initialCursor,
  locale,
}: {
  initialItems: DigestItem[];
  initialCursor: string | null;
  locale: string;
}) {
  const t = useTranslations("feed");
  const format = useFormatter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();

  const groups = groupByLaunchDay(
    items.map((i) => ({
      ...i,
      launchedAt: i.launchedAt ? new Date(i.launchedAt) : null,
    })),
  );

  function handleLoadMore() {
    if (!cursor || pending) return;
    startTransition(async () => {
      const page = await loadMoreFeed(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="font-heading text-lg font-bold">
            {group.kind === "today"
              ? t("today")
              : group.kind === "yesterday"
                ? t("yesterday")
                : format.dateTime(group.date, {
                    timeZone: "Asia/Jakarta",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            {group.items.map((item, i) => (
              <ProductCard
                key={item.id}
                item={item}
                locale={locale}
                viewerVoted={item.viewerVoted}
                rank={i + 1}
              />
            ))}
          </div>
        </section>
      ))}
      {cursor && (
        <Button
          variant="outline"
          onClick={handleLoadMore}
          disabled={pending}
          className={cn("mx-auto cursor-pointer")}
        >
          {pending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
