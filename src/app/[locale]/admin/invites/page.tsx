import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { localePath } from "@/i18n/locale-path";
import { listInvites } from "@/db/queries/invites";
import { listCategories } from "@/db/queries/categories";
import { SubmitForm } from "@/components/SubmitForm";
import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createInviteAction } from "./actions";

function claimUrl(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/claim/${token}`;
}

export default async function AdminInvitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { locale } = await params;
  const { created } = await searchParams;
  const session = await auth();
  if (!isAdmin(session)) redirect(localePath(locale, "/"));

  const t = await getTranslations("invites");
  const format = await getFormatter();
  const [invitesList, cats] = await Promise.all([
    listInvites(),
    listCategories(),
  ]);
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">
        {t("title")}
      </h1>

      {created && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-chart-3/40 bg-chart-3/10 p-5">
          <p className="text-sm">{t("created")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-card px-3 py-2 text-sm">
              {claimUrl(created)}
            </code>
            <CopyButton value={claimUrl(created)} />
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {invitesList.map((inv) => {
          const expired = inv.expiresAt < new Date();
          return (
            <Card key={inv.id} className="py-0 shadow-xs">
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
                <span className="font-medium">
                  {(inv.draft as { name?: string }).name ?? "—"}
                </span>
                {inv.note && (
                  <span className="text-sm text-muted-foreground">
                    {inv.note}
                  </span>
                )}
                <span className="text-sm text-muted-foreground/80">
                  {format.dateTime(inv.createdAt, { dateStyle: "medium" })}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {inv.claimedBy ? (
                    <Badge variant="secondary">
                      {t("claimed", { name: inv.claimedByName ?? "?" })}
                    </Badge>
                  ) : expired ? (
                    <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                      {t("expired")}
                    </Badge>
                  ) : (
                    <>
                      <Badge className="border-chart-3/40 bg-chart-3/10 text-foreground">
                        {t("open")}
                      </Badge>
                      <CopyButton value={claimUrl(inv.token)} />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 font-heading text-xl font-bold">{t("new")}</h2>
      <SubmitForm
        categories={catOptions}
        action={createInviteAction}
        submitLabel={t("create")}
        noteField
      />
    </div>
  );
}
