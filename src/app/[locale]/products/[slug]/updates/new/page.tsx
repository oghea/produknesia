import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { isAdmin } from "@/auth-helpers";
import { getProductBySlug } from "@/db/queries/products";
import { UpdateForm } from "@/components/UpdateForm";
import { FadeUp } from "@/components/motion-primitives";

export default async function NewUpdatePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail || detail.product.status !== "approved") notFound();

  const session = await auth();
  const canPost =
    session?.user &&
    (session.user.id === detail.product.makerId || isAdmin(session));
  if (!canPost) notFound();

  const t = await getTranslations("updates");

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <FadeUp>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {t("formTitle")}
        </h1>
        <p className="mt-1 text-muted-foreground">{detail.product.name}</p>
        <UpdateForm productId={detail.product.id} slug={slug} />
      </FadeUp>
    </div>
  );
}
