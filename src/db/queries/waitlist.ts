import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { launchSubscribers } from "@/db/schema";

export async function addSubscriber(
  email: string,
  dbc: DBClient = db,
): Promise<{ added: boolean }> {
  const rows = await dbc
    .insert(launchSubscribers)
    .values({ email: email.trim().toLowerCase() })
    .onConflictDoNothing()
    .returning({ id: launchSubscribers.id });
  return { added: rows.length > 0 };
}

export async function listSubscriberEmails(
  dbc: DBClient = db,
): Promise<string[]> {
  const rows = await dbc
    .select({ email: launchSubscribers.email })
    .from(launchSubscribers);
  return rows.map((r) => r.email);
}
