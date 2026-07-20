import Image from "next/image";
import { notFound } from "next/navigation";
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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail) notFound();

  const { product, makerName, images, categories } = detail;
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
    <article className="mx-auto max-w-2xl p-6">
      {product.status === "pending" && (
        <p className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          {t("pendingBanner")}
        </p>
      )}
      {product.status === "rejected" && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {t("rejectedBanner", {
            reason: product.rejectionReason ?? t("noReason"),
          })}
        </p>
      )}

      <div className="flex items-center gap-4">
        {product.logoUrl && (
          <Image
            src={product.logoUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {tagline && <p className="text-gray-600">{tagline}</p>}
          {makerName && (
            <p className="text-sm text-gray-400">{t("by", { name: makerName })}</p>
          )}
        </div>
        {product.status === "approved" && (
          <div className="ml-auto">
            <VoteButton
              productId={product.id}
              initialCount={product.voteCount}
              initialVoted={votedIds.has(product.id)}
              size="lg"
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/categories/${c.slug}`}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
          >
            {locale === "id" ? c.nameId : c.nameEn}
          </Link>
        ))}
        <a
          href={product.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          {t("visit")}
        </a>
      </div>

      {description && (
        <div className="prose prose-sm mt-6 max-w-none">
          <ReactMarkdown>{description}</ReactMarkdown>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {images.map((img) => (
            <Image
              key={img.url}
              src={img.url}
              alt=""
              width={1280}
              height={720}
              className="h-auto w-full rounded-lg border border-gray-200"
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
