import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/lib/locale-content";
import type { FeedItem } from "@/db/queries/products";
import { cn } from "@/lib/utils";
import { VoteButton } from "./VoteButton";

export function ProductCard({
  item,
  locale,
  viewerVoted,
  showVote = true,
  rank,
}: {
  item: Omit<FeedItem, "launchedAt"> & { launchedAt: Date | string | null };
  locale: string;
  viewerVoted: boolean;
  showVote?: boolean;
  /** 1-based leaderboard position — shown only where order carries meaning. */
  rank?: number;
}) {
  const t = useTranslations("feed");
  const { tagline } = pickLocalized(
    { ...item, descriptionId: null, descriptionEn: null },
    locale,
  );

  return (
    <div className="group flex items-center gap-3.5 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/60 sm:gap-4">
      {rank !== undefined && (
        <span
          aria-hidden="true"
          className={cn(
            "w-10 shrink-0 text-center font-heading text-2xl font-extrabold tabular-nums",
            rank === 1 ? "text-primary" : "text-muted-foreground/50",
          )}
        >
          {String(rank).padStart(2, "0")}
        </span>
      )}
      <Link
        href={`/products/${item.slug}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 sm:gap-4"
      >
        {item.logoUrl ? (
          <Image
            src={item.logoUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-xl border object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-accent font-heading text-2xl font-extrabold text-accent-foreground">
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-lg font-bold transition-colors group-hover:text-primary">
            {item.name}
          </h2>
          {tagline && (
            <p className="truncate text-base text-muted-foreground">{tagline}</p>
          )}
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground/80">
            {item.makerName && <span>{t("by", { name: item.makerName })}</span>}
            {item.commentCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                {item.commentCount}
              </span>
            )}
          </div>
        </div>
      </Link>
      {showVote && (
        <VoteButton
          productId={item.id}
          initialCount={item.voteCount}
          initialVoted={viewerVoted}
        />
      )}
    </div>
  );
}
