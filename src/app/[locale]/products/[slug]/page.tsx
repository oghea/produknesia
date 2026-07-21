import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, ExternalLink, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { isAdmin } from "@/auth-helpers";
import { getProductBySlug } from "@/db/queries/products";
import { getVotedProductIds } from "@/db/queries/votes";
import { listComments } from "@/db/queries/comments";
import { pickLocalized } from "@/lib/locale-content";
import { VoteButton } from "@/components/VoteButton";
import { CommentSection } from "@/components/CommentSection";
import { FadeUp } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Deduped across generateMetadata + the page render.
const getDetail = cache(getProductBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const detail = await getDetail(slug);
  // Non-approved products keep the app-default metadata (no name leak).
  if (!detail || detail.product.status !== "approved") return {};
  const { tagline } = pickLocalized(detail.product, locale);
  return {
    title: detail.product.name,
    description: tagline ?? undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const detail = await getDetail(slug);
  if (!detail) notFound();

  const { product, makerName, makerUsername, images, categories } = detail;
  const session = await auth();
  const viewerIsMaker = session?.user?.id === product.makerId;
  const viewerIsAdmin = isAdmin(session);

  if (product.status !== "approved" && !viewerIsMaker && !viewerIsAdmin) {
    notFound();
  }

  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, [product.id])
    : new Set<string>();

  const productComments =
    product.status === "approved" ? await listComments(product.id) : [];

  const t = await getTranslations("product");
  const { tagline, description } = pickLocalized(product, locale);

  return (
    <article className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {product.status === "pending" && (
        <p className="mb-6 flex items-center gap-2 rounded-lg border border-chart-2/40 bg-accent p-3 text-sm text-accent-foreground">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {t("pendingBanner")}
        </p>
      )}
      {product.status === "rejected" && (
        <p className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="size-4 shrink-0" aria-hidden="true" />
          {t("rejectedBanner", {
            reason: product.rejectionReason ?? t("noReason"),
          })}
        </p>
      )}

      <FadeUp>
        <div className="flex items-center gap-4">
          {product.logoUrl && (
            <Image
              src={product.logoUrl}
              alt=""
              width={72}
              height={72}
              className="size-18 shrink-0 rounded-2xl border object-cover"
            />
          )}
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">
              {product.name}
            </h1>
            {tagline && <p className="text-muted-foreground">{tagline}</p>}
            {makerName && (
              <p className="mt-0.5 text-sm text-muted-foreground/80">
                {makerUsername ? (
                  <Link
                    href={`/u/${makerUsername}`}
                    className="cursor-pointer transition-colors hover:text-primary hover:underline"
                  >
                    {t("by", { name: makerName })}
                  </Link>
                ) : (
                  t("by", { name: makerName })
                )}
              </p>
            )}
          </div>
          {product.status === "approved" && (
            <div className="ml-auto shrink-0">
              <VoteButton
                productId={product.id}
                initialCount={product.voteCount}
                initialVoted={votedIds.has(product.id)}
                size="lg"
              />
            </div>
          )}
        </div>
      </FadeUp>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {categories.map((c) => (
          <Badge
            key={c.slug}
            variant="secondary"
            className="cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground"
            render={<Link href={`/categories/${c.slug}`} />}
          >
            {locale === "id" ? c.nameId : c.nameEn}
          </Badge>
        ))}
        <Button
          size="sm"
          variant="sticker"
          className="ml-auto cursor-pointer"
          nativeButton={false}
          render={
            <a
              href={product.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          {t("visit")}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {description && (
        <div className="prose prose-sm mt-8 max-w-none dark:prose-invert">
          <ReactMarkdown>{description}</ReactMarkdown>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          {images.map((img) => (
            <Image
              key={img.url}
              src={img.url}
              alt=""
              width={1280}
              height={720}
              className="h-auto w-full rounded-xl border shadow-xs"
            />
          ))}
        </div>
      )}

      {product.status === "approved" && (
        <CommentSection
          productId={product.id}
          slug={product.slug}
          comments={productComments}
          viewerId={session?.user?.id ?? null}
          viewerIsAdmin={viewerIsAdmin}
          isAuthenticated={!!session?.user}
        />
      )}
    </article>
  );
}
