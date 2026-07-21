import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { addSubscriber, listSubscriberEmails } from "./waitlist";

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
});

describe("addSubscriber", () => {
  it("adds a normalized email", async () => {
    const r = await addSubscriber("  Budi@Example.COM ", db);
    expect(r).toEqual({ added: true });
    expect(await listSubscriberEmails(db)).toEqual(["budi@example.com"]);
  });

  it("dedupes silently", async () => {
    await addSubscriber("a@b.co", db);
    const r = await addSubscriber("A@B.CO", db);
    expect(r).toEqual({ added: false });
    expect(await listSubscriberEmails(db)).toHaveLength(1);
  });
});
