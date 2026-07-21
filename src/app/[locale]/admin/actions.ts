"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/auth";
import { assertAdmin } from "@/auth-helpers";
import { approveProduct, rejectProduct } from "@/db/queries/products";
import { approveUpdate, rejectUpdate } from "@/db/queries/updates";
import { sendEmails, updateApprovedEmail } from "@/lib/email";

export async function approveAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  if (id) await approveProduct(id);
  revalidatePath("/", "layout");
}

export async function rejectAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (id) await rejectProduct(id, reason);
  revalidatePath("/", "layout");
}

export async function approveUpdateAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const payload = await approveUpdate(id);
  if (payload) {
    // Fan-out after the response — never blocks or breaks the approval.
    after(async () => {
      const title = payload.update.titleId ?? payload.update.titleEn ?? "";
      const body = payload.update.bodyId ?? payload.update.bodyEn ?? "";
      await sendEmails(
        payload.watchers.map((w) => ({
          to: w.email,
          ...updateApprovedEmail({
            productName: payload.productName,
            productSlug: payload.productSlug,
            version: payload.update.version,
            title,
            body,
            unsubscribeToken: w.unsubscribeToken,
          }),
        })),
      );
    });
  }
  revalidatePath("/", "layout");
}

export async function rejectUpdateAction(formData: FormData): Promise<void> {
  const session = await auth();
  assertAdmin(session);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (id) await rejectUpdate(id, reason);
  revalidatePath("/", "layout");
}
