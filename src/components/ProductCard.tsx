import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/lib/locale-content";
import type { FeedItem } from "@/db/queries/products";
import { VoteButton } from "./VoteButton";

export async function ProductCard({
  item,
  locale,
  viewerVoted,
}: {
  item: FeedItem;
  locale: string;
  viewerVoted: boolean;
}) {
  const t = await getTranslations("feed");
  const { tagline } = pickLocalized(
    { ...item, descriptionId: null, descriptionEn: null },
    locale,
  );

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 hover:border-gray-400">
      <Link
        href={`/products/${item.slug}`}
        className="flex min-w-0 flex-1 items-center gap-4"
      >
        {item.logoUrl ? (
          <Image
            src={item.logoUrl}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-gray-100 text-xl font-bold text-gray-400">
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{item.name}</h2>
          {tagline && (
            <p className="truncate text-sm text-gray-600">{tagline}</p>
          )}
          {item.makerName && (
            <p className="text-xs text-gray-400">
              {t("by", { name: item.makerName })}
            </p>
          )}
        </div>
      </Link>
      <VoteButton
        productId={item.id}
        initialCount={item.voteCount}
        initialVoted={viewerVoted}
      />
    </div>
  );
}
