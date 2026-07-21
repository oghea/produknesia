import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame, PackageOpen, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { getCategoryBySlug, listProductsByCategory } from "@/db/queries/discovery";
import { getVotedProductIds } from "@/db/queries/votes";
import type { FeedSort } from "@/db/queries/products";
import { ProductCard } from "@/components/ProductCard";
import { StaggerItem, StaggerList } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

// Deduped across generateMetadata + the page render.
const getCategory = cache(getCategoryBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};
  return { title: locale === "id" ? category.nameId : category.nameEn };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { locale, slug } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: FeedSort = sortParam === "newest" ? "newest" : "popular";

  const category = await getCategory(slug);
  if (!category) notFound();

  const t = await getTranslations();
  const items = await listProductsByCategory(category.id, sort);
  const session = await auth();
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
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {locale === "id" ? category.nameId : category.nameEn}
        </h1>
        <nav className="flex gap-1">
          <Link
            href={`/categories/${slug}?sort=popular`}
            className={tabCls(sort === "popular")}
          >
            <Flame className="size-4" aria-hidden="true" />
            {t("home.popular")}
          </Link>
          <Link
            href={`/categories/${slug}?sort=newest`}
            className={tabCls(sort === "newest")}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {t("home.newest")}
          </Link>
        </nav>
      </div>

      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <PackageOpen
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-base text-muted-foreground">
            {t("categories.empty")}
          </p>
        </div>
      ) : (
        <StaggerList className="mt-6 flex flex-col gap-4">
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
