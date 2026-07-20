import Image from "next/image";
import { notFound } from "next/navigation";
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

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-800">
        {t("statusPending")}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
        {t("statusRejected")}
      </span>
    );
  }
  return null;
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  const profile = await getUserByUsername(username);
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
      <div key={item.id} className="flex flex-col gap-1">
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
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center gap-4">
        {profile.image ? (
          <Image
            src={profile.image}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl font-bold text-gray-500">
            {(profile.name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{profile.name ?? profile.username}</h1>
          {profile.bio && <p className="text-gray-600">{profile.bio}</p>}
          <p className="text-sm text-gray-400">
            {t("joined", {
              date: format.dateTime(profile.createdAt, { dateStyle: "medium" }),
            })}
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">{t("submissions")}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {submissions.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
        ) : (
          submissions.map(renderCard)
        )}
      </div>

      <h2 className="mt-8 text-lg font-bold">{t("upvoted")}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {upvoted.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noUpvotes")}</p>
        ) : (
          upvoted.map(renderCard)
        )}
      </div>
    </div>
  );
}
