import { BellOff, CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { unsubscribeByToken } from "@/db/queries/watches";

export default async function UnwatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const removed = await unsubscribeByToken(token);
  const t = await getTranslations("unwatch");

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        {removed ? (
          <BellOff className="size-8 text-muted-foreground" aria-hidden="true" />
        ) : (
          <CircleAlert className="size-8 text-muted-foreground" aria-hidden="true" />
        )}
        <p className="text-base text-muted-foreground">
          {removed ? t("done") : t("invalid")}
        </p>
      </div>
    </div>
  );
}
