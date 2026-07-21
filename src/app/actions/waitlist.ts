"use server";

import { parseWaitlistForm } from "@/lib/validation";
import { addSubscriber } from "@/db/queries/waitlist";

export type WaitlistState = { ok: boolean; errors: Record<string, string> };

export async function joinWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = parseWaitlistForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  // Duplicates return ok too — identical response, no enumeration.
  await addSubscriber(parsed.email);
  return { ok: true, errors: {} };
}
