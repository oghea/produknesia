"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertAdmin } from "@/auth-helpers";
import { approveProduct, rejectProduct } from "@/db/queries/products";

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
