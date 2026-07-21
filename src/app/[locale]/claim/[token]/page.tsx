import Image from "next/image";
import { CircleAlert, LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/auth";
import { localePath } from "@/i18n/locale-path";
import { getOpenInviteByToken } from "@/db/queries/invites";
import { listCategories } from "@/db/queries/categories";
import { inviteDraftSchema } from "@/lib/validation";
import { SubmitForm } from "@/components/SubmitForm";
import { FadeUp } from "@/components/motion-primitives";
import { PendingButton } from "@/components/PendingButton";
import { claimAction } from "./actions";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations("invites");
  const invite = await getOpenInviteByToken(token);
  const parsed = invite ? inviteDraftSchema.safeParse(invite.draft) : null;

  if (!invite || !parsed?.success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <CircleAlert
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-base text-muted-foreground">{t("deadEnd")}</p>
        </div>
      </div>
    );
  }

  const draft = parsed.data;
  const session = await auth();

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {t("claimTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("claimIntro")}</p>

        <div className="mt-6 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-4">
            {draft.logoUrl && (
              <Image
                src={draft.logoUrl}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-xl border object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-bold">
                {draft.name}
              </p>
              {(draft.taglineId ?? draft.taglineEn) && (
                <p className="truncate text-base text-muted-foreground">
                  {locale === "id"
                    ? (draft.taglineId ?? draft.taglineEn)
                    : (draft.taglineEn ?? draft.taglineId)}
                </p>
              )}
            </div>
          </div>
          {draft.screenshotUrls.length > 0 && (
            <div className="mt-3 flex gap-3 overflow-x-auto">
              {draft.screenshotUrls.map((url) => (
                <Image
                  key={url}
                  src={url}
                  alt=""
                  width={200}
                  height={112}
                  className="h-28 w-auto shrink-0 rounded-lg border object-cover"
                />
              ))}
            </div>
          )}
        </div>

        {!session?.user ? (
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google", {
                redirectTo: localePath(locale, `/claim/${token}`),
              });
            }}
          >
            <PendingButton className="cursor-pointer">
              <LogIn className="size-4" aria-hidden="true" />
              {t("claimSignIn")}
            </PendingButton>
          </form>
        ) : (
          <ClaimForm token={token} locale={locale} draft={draft} />
        )}
      </FadeUp>
    </div>
  );
}

async function ClaimForm({
  token,
  locale,
  draft,
}: {
  token: string;
  locale: string;
  draft: ReturnType<typeof inviteDraftSchema.parse>;
}) {
  const t = await getTranslations("invites");
  const cats = await listCategories();
  const catOptions = cats.map((c) => ({
    id: c.id,
    label: locale === "id" ? c.nameId : c.nameEn,
  }));
  return (
    <SubmitForm
      categories={catOptions}
      action={claimAction}
      submitLabel={t("claimCta")}
      defaults={{
        name: draft.name,
        taglineId: draft.taglineId,
        taglineEn: draft.taglineEn,
        descriptionId: draft.descriptionId,
        descriptionEn: draft.descriptionEn,
        websiteUrl: draft.websiteUrl,
        categoryIds: draft.categoryIds,
      }}
      hiddenFields={{ inviteToken: token }}
    />
  );
}
