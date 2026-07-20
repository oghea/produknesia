import { asc } from "drizzle-orm";
import { db } from "@/db";
import type { DBClient } from "@/db/types";
import { categories } from "@/db/schema";

export async function listCategories(dbc: DBClient = db) {
  return dbc
    .select({
      id: categories.id,
      slug: categories.slug,
      nameId: categories.nameId,
      nameEn: categories.nameEn,
    })
    .from(categories)
    .orderBy(asc(categories.slug));
}
