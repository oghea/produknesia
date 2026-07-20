import { Flame, PackageOpen, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { listFeed, type FeedSort } from "@/db/queries/products";
import { getVotedProductIds } from "@/db/queries/votes";
import { listCategories } from "@/db/queries/categories";
import { ProductCard } from "@/components/ProductCard";
import { FadeUp, StaggerItem, StaggerList } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const [items, cats, session] = await Promise.all([
    listFeed(sort),
    listCategories(),
    auth(),
  ]);
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  const tabCls = (active: boolean) =>
    cn(
      "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground shadow-xs"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          {t("app.tagline")}
        </h1>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <Badge
              key={c.id}
              variant="secondary"
              className="cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
              render={<Link href={`/categories/${c.slug}`} />}
            >
              {locale === "id" ? c.nameId : c.nameEn}
            </Badge>
          ))}
        </div>
      </FadeUp>

      <div className="mt-8 flex items-center gap-1 border-b pb-3">
        <Link href="/?sort=popular" className={tabCls(sort === "popular")}>
          <Flame className="size-4" aria-hidden="true" />
          {t("home.popular")}
        </Link>
        <Link href="/?sort=newest" className={tabCls(sort === "newest")}>
          <Sparkles className="size-4" aria-hidden="true" />
          {t("home.newest")}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <PackageOpen className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("feed.empty")}</p>
        </div>
      ) : (
        <StaggerList className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <StaggerItem key={item.id}>
              <ProductCard
                item={item}
                locale={locale}
                viewerVoted={votedIds.has(item.id)}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </div>
  );
}
