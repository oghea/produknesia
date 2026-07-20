import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createId } from "@paralleldrive/cuid2";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function seedTestUser(
  db: TestDb,
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const [row] = await db
    .insert(users)
    .values({
      id: createId(),
      name: "Test User",
      email: `${createId()}@test.local`,
      ...overrides,
    })
    .returning({ id: users.id });
  return row;
}
