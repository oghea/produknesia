import { describe, it, expect } from "vitest";
import { createTestDb, seedTestUser } from "./db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("test db harness", () => {
  it("applies the real migration and accepts inserts", async () => {
    const db = await createTestDb();
    const user = await seedTestUser(db, { name: "Tester" });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.name).toBe("Tester");
    expect(row.role).toBe("user"); // schema default survived migration
  });
});
