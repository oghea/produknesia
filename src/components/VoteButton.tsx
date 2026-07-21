"use client";

import { useState, useTransition } from "react";
import { ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { voteAction } from "@/app/actions/vote";
import { cn } from "@/lib/utils";

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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={voted}
      aria-label={`${voted ? t("voted") : t("label")} (${count})`}
      className={cn(
        // Sticker press: hard ink border + offset shadow; the button
        // physically sits down when tapped.
        "flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-(--hard-shadow-color) font-semibold shadow-hard-sm transition-[translate,box-shadow,background-color,color] duration-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60",
        size === "lg" ? "gap-1 px-5 py-3 text-lg" : "px-3.5 py-2 text-base",
        voted
          ? "bg-primary text-primary-foreground"
          : "bg-card text-foreground hover:bg-accent",
      )}
    >
      <motion.span
        aria-hidden="true"
        animate={voted ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <ChevronUp
          className={size === "lg" ? "size-6" : "size-5"}
          strokeWidth={3}
        />
      </motion.span>
      <span className="relative font-heading tabular-nums" aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="inline-block"
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}
