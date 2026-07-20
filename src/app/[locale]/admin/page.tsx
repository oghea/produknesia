import Image from "next/image";
import { redirect } from "next/navigation";
import { Check, ExternalLink, Inbox, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { listPending } from "@/db/queries/products";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>

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
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full cursor-pointer bg-chart-3 text-white hover:bg-chart-3/85 sm:w-auto"
                  >
                    <Check className="size-4" aria-hidden="true" />
                    {t("approve")}
                  </Button>
                </form>
                <form action={rejectAction} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <Input
                    name="reason"
                    placeholder={t("reasonPlaceholder")}
                    aria-label={t("reasonPlaceholder")}
                    className="h-8 flex-1 text-sm"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="destructive"
                    className="cursor-pointer"
                  >
                    <X className="size-4" aria-hidden="true" />
                    {t("reject")}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
