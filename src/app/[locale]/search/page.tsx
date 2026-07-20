import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { searchProducts } from "@/db/queries/discovery";
import { getVotedProductIds } from "@/db/queries/votes";
import { ProductCard } from "@/components/ProductCard";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q = "" } = await searchParams;
  const t = await getTranslations("search");
  const query = q.trim();

  const items = await searchProducts(query);
  const session = await auth();
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">{t("title", { q: query })}</h1>
      <div className="mt-6 flex flex-col gap-3">
        {query.length < 2 ? (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("tooShort")}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-md bg-gray-50 p-6 text-center text-gray-500">
            {t("empty")}
          </p>
        ) : (
          items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              locale={locale}
              viewerVoted={votedIds.has(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
