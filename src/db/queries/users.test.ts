import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestUser, type TestDb } from "@/test/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assignUsername } from "./users";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

describe("assignUsername", () => {
  it("assigns a slugified username from the name", async () => {
    const u = await seedTestUser(db, { name: "Budi Santoso" });
    expect(await assignUsername(u.id, db)).toBe("budi-santoso");
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.username).toBe("budi-santoso");
  });

  it("is idempotent — never overwrites an existing username", async () => {
    const u = await seedTestUser(db, { name: "Budi", username: "custom" });
    expect(await assignUsername(u.id, db)).toBe("custom");
  });

  it("de-duplicates with a counter", async () => {
    const a = await seedTestUser(db, { name: "Sama Nama" });
    const b = await seedTestUser(db, { name: "Sama Nama" });
    await assignUsername(a.id, db);
    expect(await assignUsername(b.id, db)).toBe("sama-nama-2");
  });

  it("returns null for an unknown user", async () => {
    expect(await assignUsername("nope", db)).toBeNull();
  });
});
