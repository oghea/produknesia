import Image from "next/image";
import { redirect } from "next/navigation";
import { Check, ExternalLink, Inbox, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { listPending } from "@/db/queries/products";
import { listPendingUpdates } from "@/db/queries/updates";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/PendingButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  approveAction,
  approveUpdateAction,
  rejectAction,
  rejectUpdateAction,
} from "./actions";
import { localePath } from "@/i18n/locale-path";
import { pickLocalizedPair } from "@/lib/locale-content";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!isAdmin(session)) redirect(localePath(locale, "/"));

  const t = await getTranslations("admin");
  const tUpdates = await getTranslations("adminUpdates");
  const tInvites = await getTranslations("invites");
  const [pending, pendingUpdates] = await Promise.all([
    listPending(),
    listPendingUpdates(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {t("title")}
        </h1>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="ml-auto cursor-pointer"
          render={<Link href="/admin/invites" />}
        >
          {tInvites("title")}
        </Button>
      </div>

      {pending.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {pending.map((p) => (
          <Card key={p.id} className="py-0 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {p.logoUrl ? (
                  <Image
                    src={p.logoUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent font-heading font-bold text-accent-foreground">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading font-semibold">
                    {p.name}
                  </p>
                  {p.makerName && (
                    <p className="text-xs text-muted-foreground">
                      {t("submittedBy", { name: p.makerName })}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  nativeButton={false}
                  render={<Link href={`/products/${p.slug}`} />}
                >
                  {t("view")}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Button>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
                <form action={approveAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <PendingButton
                    size="sm"
                    className="w-full cursor-pointer bg-chart-3 text-white hover:bg-chart-3/85 sm:w-auto"
                  >
                    <Check className="size-4" aria-hidden="true" />
                    {t("approve")}
                  </PendingButton>
                </form>
                <form action={rejectAction} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <Input
                    name="reason"
                    placeholder={t("reasonPlaceholder")}
                    aria-label={t("reasonPlaceholder")}
                    className="h-8 flex-1 text-sm"
                  />
                  <PendingButton
                    size="sm"
                    variant="destructive"
                    className="cursor-pointer"
                  >
                    <X className="size-4" aria-hidden="true" />
                    {t("reject")}
                  </PendingButton>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-12 font-heading text-xl font-bold">
        {tUpdates("title")}
      </h2>

      {pendingUpdates.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-base text-muted-foreground">
          {tUpdates("empty")}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {pendingUpdates.map((u) => (
          <Card key={u.id} className="py-0 shadow-xs">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading font-bold">{u.productName}</span>
                {u.version && <Badge variant="secondary">{u.version}</Badge>}
                <span className="text-sm text-muted-foreground">
                  {pickLocalizedPair(u.titleId, u.titleEn, locale)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto cursor-pointer"
                  nativeButton={false}
                  render={<Link href={`/products/${u.productSlug}`} />}
                >
                  {t("view")}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {(u.bodyId ?? u.bodyEn ?? "").slice(0, 400)}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
                <form action={approveUpdateAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <PendingButton
                    size="sm"
                    className="w-full cursor-pointer bg-chart-3 text-white hover:bg-chart-3/85 sm:w-auto"
                  >
                    <Check className="size-4" aria-hidden="true" />
                    {t("approve")}
                  </PendingButton>
                </form>
                <form action={rejectUpdateAction} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Input
                    name="reason"
                    placeholder={t("reasonPlaceholder")}
                    aria-label={t("reasonPlaceholder")}
                    className="h-9 flex-1 text-sm"
                  />
                  <PendingButton
                    size="sm"
                    variant="destructive"
                    className="cursor-pointer"
                  >
                    <X className="size-4" aria-hidden="true" />
                    {t("reject")}
                  </PendingButton>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
