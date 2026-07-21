"use client";

import { useState, useTransition } from "react";
import { Bell, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { watchAction } from "@/app/actions/watch";
import { Button } from "@/components/ui/button";

export function WatchButton({
  productId,
  initialWatching,
}: {
  productId: string;
  initialWatching: boolean;
}) {
  const t = useTranslations("watch");
  const pathname = usePathname();
  const [watching, setWatching] = useState(initialWatching);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    const prev = watching;
    setWatching(!prev);
    startTransition(async () => {
      const result = await watchAction(productId, pathname);
      setWatching(result ? result.watching : prev);
    });
  }

  return (
    <Button
      variant={watching ? "secondary" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={watching}
      className="cursor-pointer"
    >
      {watching ? (
        <BellRing className="size-4" aria-hidden="true" />
      ) : (
        <Bell className="size-4" aria-hidden="true" />
      )}
      {watching ? t("watching") : t("label")}
    </Button>
  );
}
