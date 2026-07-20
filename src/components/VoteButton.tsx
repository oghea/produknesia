"use client";

import { useState, useTransition } from "react";
import { ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={voted}
      aria-label={`${voted ? t("voted") : t("label")} (${count})`}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        size === "lg" ? "gap-0.5 px-4 py-2 text-base" : "px-3 py-1.5 text-sm",
        voted
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/50 hover:text-primary",
      )}
    >
      <motion.span
        aria-hidden="true"
        animate={voted ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <ChevronUp className={size === "lg" ? "size-5" : "size-4"} />
      </motion.span>
      <span className="relative tabular-nums" aria-hidden="true">
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
    </motion.button>
  );
}
