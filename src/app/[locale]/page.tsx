import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { listFeed, type FeedSort } from "@/db/queries/products";
import { getVotedProductIds } from "@/db/queries/votes";
import { ProductCard } from "@/components/ProductCard";

export default async function Home({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { locale } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: FeedSort = sortParam === "newest" ? "newest" : "popular";
  const t = await getTranslations();
  const items = await listFeed(sort);
  const session = await auth();
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium ${
      active ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("app.tagline")}</h1>
        <nav className="flex gap-1">
          <Link href="/?sort=popular" className={tabCls(sort === "popular")}>
            {t("home.popular")}
          </Link>
          <Link href="/?sort=newest" className={tabCls(sort === "newest")}>
            {t("home.newest")}
          </Link>
        </nav>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {items.length === 0 && (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("feed.empty")}
          </p>
        )}
        {items.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            locale={locale}
            viewerVoted={votedIds.has(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
