import { Flame, PackageOpen, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { isComingSoon } from "@/lib/launch";
import { listFeed, type FeedSort } from "@/db/queries/products";
import { getVotedProductIds } from "@/db/queries/votes";
import { listCategories } from "@/db/queries/categories";
import { ProductCard } from "@/components/ProductCard";
import { Landing } from "@/components/Landing";
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
  const session = await auth();
  if (isComingSoon() && !isAdmin(session)) {
    return <Landing />;
  }
  const [items, cats] = await Promise.all([listFeed(sort), listCategories()]);
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  const tabCls = (active: boolean) =>
    cn(
      "flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-[0.9375rem] font-medium transition-colors",
      active
        ? "bg-foreground text-background"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t("app.tagline")}
        </h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {cats.map((c) => (
            <Badge
              key={c.id}
              variant="outline"
              className="cursor-pointer transition-colors hover:border-foreground hover:text-foreground"
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
          <p className="text-base text-muted-foreground">{t("feed.empty")}</p>
        </div>
      ) : (
        <StaggerList className="mt-5 flex flex-col gap-4">
          {items.map((item, i) => (
            <StaggerItem key={item.id}>
              <ProductCard
                item={item}
                locale={locale}
                viewerVoted={votedIds.has(item.id)}
                rank={sort === "popular" ? i + 1 : undefined}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </div>
  );
}
