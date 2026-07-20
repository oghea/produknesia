import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

async function main() {
  const { db } = await import("./index");
  const { categories } = await import("./schema");
  const { CATEGORIES } = await import("./seed-data");

  await db
    .insert(categories)
    .values([...CATEGORIES])
    .onConflictDoNothing({ target: categories.slug });

  const rows = await db.select({ slug: categories.slug }).from(categories);
  console.log(`Categories in DB: ${rows.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
