"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { voteAction } from "@/app/actions/vote";

export function VoteButton({
  productId,
  initialCount,
  initialVoted,
  size = "sm",
}: {
  productId: string;
  initialCount: number;
  initialVoted: boolean;
  size?: "sm" | "lg";
}) {
  const t = useTranslations("vote");
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(initialVoted);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    const prev = { count, voted };
    // Optimistic flip; reconciled (or reverted) from the action result.
    setVoted(!prev.voted);
    setCount(prev.count + (prev.voted ? -1 : 1));
    startTransition(async () => {
      const result = await voteAction(productId, pathname);
      if (result) {
        setVoted(result.voted);
        setCount(result.voteCount);
      } else {
        setVoted(prev.voted);
        setCount(prev.count);
      }
    });
  }

  const base =
    "flex flex-col items-center rounded-md border font-medium transition-colors";
  const sizing = size === "lg" ? "px-4 py-2 text-base" : "px-3 py-1 text-sm";
  const tone = voted
    ? "border-black bg-black text-white"
    : "border-gray-200 text-gray-700 hover:border-gray-400";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={voted}
      aria-label={voted ? t("voted") : t("label")}
      className={`${base} ${sizing} ${tone} disabled:opacity-60`}
    >
      <span aria-hidden="true">▲</span>
      <span>{count}</span>
    </button>
  );
}
