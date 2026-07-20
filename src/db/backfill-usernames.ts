import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

async function main() {
  const { db } = await import("./index");
  const { users } = await import("./schema");
  const { assignUsername } = await import("./queries/users");
  const { isNull } = await import("drizzle-orm");

  const missing = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.username));
  for (const row of missing) {
    await assignUsername(row.id);
  }
  console.log(`Backfilled ${missing.length} username(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
