import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronUp, Package } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import {
  getUserByUsername,
  listProductsByMaker,
  listVotedProducts,
  type MakerProduct,
} from "@/db/queries/users";
import { getVotedProductIds } from "@/db/queries/votes";
import { ProductCard } from "@/components/ProductCard";
import { FadeUp } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  if (status === "pending") {
    return (
      <Badge className="border-chart-2/40 bg-accent text-accent-foreground">
        {t("statusPending")}
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
        {t("statusRejected")}
      </Badge>
    );
  }
  return null;
}

// Deduped across generateMetadata + the page render.
const getProfile = cache(getUserByUsername);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return {};
  return { title: profile.name ?? profile.username ?? undefined };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  const profile = await getProfile(username);
  if (!profile) notFound();

  const session = await auth();
  const isOwn = session?.user?.id === profile.id;
  const canSeeAll = isOwn || isAdmin(session);

  const t = await getTranslations("profile");
  const format = await getFormatter();

  const [submissions, upvoted] = await Promise.all([
    listProductsByMaker(profile.id, canSeeAll),
    listVotedProducts(profile.id),
  ]);

  const allIds = [...submissions, ...upvoted].map((p) => p.id);
  const votedIds = session?.user
    ? await getVotedProductIds(session.user.id, allIds)
    : new Set<string>();

  const renderCard = (item: MakerProduct | (typeof upvoted)[number]) => {
    const status = "status" in item ? item.status : "approved";
    return (
      <div key={item.id} className="flex flex-col gap-1.5">
        {status !== "approved" && (
          <div>
            <StatusBadge status={status} t={t} />
          </div>
        )}
        <ProductCard
          item={item}
          locale={locale}
          viewerVoted={votedIds.has(item.id)}
          showVote={status === "approved"}
        />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <FadeUp>
        <div className="flex items-center gap-4">
          {profile.image ? (
            <Image
              src={profile.image}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-full border object-cover"
            />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent font-heading text-2xl font-bold text-accent-foreground">
              {(profile.name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-bold">
              {profile.name ?? profile.username}
            </h1>
            {profile.bio && (
              <p className="text-muted-foreground">{profile.bio}</p>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground/80">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {t("joined", {
                date: format.dateTime(profile.createdAt, {
                  dateStyle: "medium",
                }),
              })}
            </p>
          </div>
        </div>
      </FadeUp>

      <h2 className="mt-10 flex items-center gap-2 font-heading text-lg font-bold">
        <Package className="size-4.5 text-primary" aria-hidden="true" />
        {t("submissions")}
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {submissions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("noSubmissions")}
          </p>
        ) : (
          submissions.map(renderCard)
        )}
      </div>

      <h2 className="mt-10 flex items-center gap-2 font-heading text-lg font-bold">
        <ChevronUp className="size-4.5 text-primary" aria-hidden="true" />
        {t("upvoted")}
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {upvoted.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("noUpvotes")}
          </p>
        ) : (
          upvoted.map(renderCard)
        )}
      </div>
    </div>
  );
}
