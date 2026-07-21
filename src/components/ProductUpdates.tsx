import { getFormatter, getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import type { UpdateItem } from "@/db/queries/updates";
import { pickLocalizedPair } from "@/lib/locale-content";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export async function ProductUpdates({
  updates,
  locale,
}: {
  updates: UpdateItem[];
  locale: string;
}) {
  const t = await getTranslations("updates");
  const format = await getFormatter();
  if (updates.length === 0) return null;

  return (
    <section className="mt-12">
      <Separator />
      <h2 className="mt-8 font-heading text-xl font-bold">{t("title")}</h2>
      <div className="mt-6 flex flex-col gap-8">
        {updates.map((u) => (
          <article key={u.id}>
            <div className="flex flex-wrap items-center gap-2">
              {u.version && <Badge variant="secondary">{u.version}</Badge>}
              <h3 className="font-heading text-lg font-bold">
                {pickLocalizedPair(u.titleId, u.titleEn, locale)}
              </h3>
              {u.status === "pending" && (
                <Badge className="border-chart-2/40 bg-accent text-accent-foreground">
                  {t("pendingBadge")}
                </Badge>
              )}
              {u.status === "rejected" && (
                <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                  {t("rejectedBadge", {
                    reason: u.rejectionReason ?? t("noReason"),
                  })}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground/80">
                {format.dateTime(u.publishedAt ?? u.createdAt, {
                  dateStyle: "medium",
                })}
              </span>
            </div>
            <div className="prose mt-2 max-w-none dark:prose-invert">
              <ReactMarkdown
                components={{
                  img: () => null,
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      rel="nofollow ugc noopener noreferrer"
                      target="_blank"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {pickLocalizedPair(u.bodyId, u.bodyEn, locale) ?? ""}
              </ReactMarkdown>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
