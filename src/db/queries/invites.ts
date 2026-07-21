import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import {
  invites,
  productCategories,
  productImages,
  products,
  users,
} from "@/db/schema";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import type { InviteDraft } from "@/lib/validation";
import { slugExists } from "./products";

export type InviteRow = typeof invites.$inferSelect;

export async function createInvite(
  args: {
    draft: InviteDraft;
    note?: string;
    createdBy: string;
    expiresInDays?: number;
  },
  dbc: DBClient = db,
): Promise<{ id: string; token: string }> {
  const days = args.expiresInDays ?? 14;
  const [row] = await dbc
    .insert(invites)
    .values({
      draft: args.draft,
      note: args.note ?? null,
      createdBy: args.createdBy,
      expiresAt: sql`now() + make_interval(days => ${days})`,
    })
    .returning({ id: invites.id, token: invites.token });
  return row;
}

export async function getOpenInviteByToken(
  token: string,
  dbc: DBClient = db,
): Promise<InviteRow | null> {
  const rows = await dbc
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.token, token),
        isNull(invites.claimedBy),
        gt(invites.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listInvites(
  dbc: DBClient = db,
): Promise<(InviteRow & { claimedByName: string | null })[]> {
  const rows = await dbc
    .select({ invite: invites, claimedByName: users.name })
    .from(invites)
    .leftJoin(users, eq(invites.claimedBy, users.id))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => ({ ...r.invite, claimedByName: r.claimedByName }));
}

export async function claimInvite(
  args: { token: string; userId: string; data: InviteDraft },
  dbc: DBClient = db,
): Promise<{ productId: string; slug: string } | null> {
  const base = slugify(args.data.name) || "produk";
  const slug = await ensureUniqueSlug(base, (s) => slugExists(s, dbc));

  return dbc.transaction(async (tx) => {
    // Claim guard: only an open, unexpired, unclaimed invite transitions.
    const claimed = await tx
      .update(invites)
      .set({
        claimedBy: args.userId,
        claimedAt: sql`now()`,
      })
      .where(
        and(
          eq(invites.token, args.token),
          isNull(invites.claimedBy),
          gt(invites.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: invites.id });
    if (claimed.length === 0) return null;

    const [product] = await tx
      .insert(products)
      .values({
        slug,
        name: args.data.name,
        taglineId: args.data.taglineId ?? null,
        taglineEn: args.data.taglineEn ?? null,
        descriptionId: args.data.descriptionId ?? null,
        descriptionEn: args.data.descriptionEn ?? null,
        websiteUrl: args.data.websiteUrl,
        logoUrl: args.data.logoUrl ?? null,
        makerId: args.userId,
        status: "approved",
        launchedAt: sql`now()`,
      })
      .returning({ id: products.id, slug: products.slug });

    if (args.data.screenshotUrls.length > 0) {
      await tx.insert(productImages).values(
        args.data.screenshotUrls.map((url, i) => ({
          productId: product.id,
          url,
          sortOrder: i,
        })),
      );
    }
    await tx.insert(productCategories).values(
      args.data.categoryIds.map((categoryId) => ({
        productId: product.id,
        categoryId,
      })),
    );
    await tx
      .update(invites)
      .set({ claimedProductId: product.id })
      .where(eq(invites.id, claimed[0].id));

    return { productId: product.id, slug: product.slug };
  });
}
