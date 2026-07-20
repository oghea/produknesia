import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { listPending } from "@/db/queries/products";
import { Link } from "@/i18n/navigation";
import { approveAction, rejectAction } from "./actions";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!isAdmin(session)) redirect(`/${locale}`);

  const t = await getTranslations("admin");
  const pending = await listPending();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      {pending.length === 0 && (
        <p className="mt-6 rounded-md bg-gray-50 p-6 text-center text-gray-500">
          {t("empty")}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {pending.map((p) => (
          <div key={p.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              {p.logoUrl && (
                <Image
                  src={p.logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-md object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                {p.makerName && (
                  <p className="text-xs text-gray-400">
                    {t("submittedBy", { name: p.makerName })}
                  </p>
                )}
              </div>
              <Link
                href={`/products/${p.slug}`}
                className="text-sm text-gray-600 underline"
              >
                {t("view")}
              </Link>
            </div>

            <div className="mt-3 flex items-start gap-2">
              <form action={approveAction}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  {t("approve")}
                </button>
              </form>
              <form action={rejectAction} className="flex flex-1 gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="reason"
                  placeholder={t("reasonPlaceholder")}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  {t("reject")}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
