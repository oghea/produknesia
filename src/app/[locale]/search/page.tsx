import { SearchX, Type } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { isComingSoon } from "@/lib/launch";
import { localePath } from "@/i18n/locale-path";
import { searchProducts } from "@/db/queries/discovery";
import { getVotedProductIds } from "@/db/queries/votes";
import { ProductCard } from "@/components/ProductCard";
import { StaggerItem, StaggerList } from "@/components/motion-primitives";

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof SearchX;
  text: string;
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-base text-muted-foreground">{text}</p>
    </div>
  );
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ : "";
  const t = await getTranslations("search");
  const query = q.trim().slice(0, 100);

  const session = await auth();
  if (isComingSoon() && !isAdmin(session)) redirect(localePath(locale, "/"));

  const items = await searchProducts(query);
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, items.map((i) => i.id))
    : new Set<string>();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">
        {t("title", { q: query })}
      </h1>
      {query.length < 2 ? (
        <EmptyState icon={Type} text={t("tooShort")} />
      ) : items.length === 0 ? (
        <EmptyState icon={SearchX} text={t("empty")} />
      ) : (
        <StaggerList className="mt-6 flex flex-col gap-4">
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
