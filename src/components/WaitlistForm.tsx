"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  joinWaitlistAction,
  type WaitlistState,
} from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: WaitlistState = { ok: false, errors: {} };

export function WaitlistForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(
    joinWaitlistAction,
    initialState,
  );

  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-chart-3/40 bg-chart-3/10 px-4 py-3 text-base">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
        {t("landing.joined")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="email"
          name="email"
          required
          placeholder={t("landing.emailPlaceholder")}
          aria-label={t("landing.emailPlaceholder")}
          className="flex-1"
        />
        <Button type="submit" disabled={pending} className="cursor-pointer">
          {pending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {t("landing.joinWaitlist")}
        </Button>
      </div>
      {state.errors.email && (
        <p className="text-sm text-destructive">{t(state.errors.email)}</p>
      )}
    </form>
  );
}
