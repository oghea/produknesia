import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmails, updateApprovedEmail } from "./email";

describe("sendEmails", () => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200 }),
  );
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("no-ops without RESEND_API_KEY", async () => {
    await sendEmails([{ to: "a@b.c", subject: "s", html: "<p>x</p>" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches in chunks of 100", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: `u${i}@test.local`,
      subject: "s",
      html: "<p>x</p>",
    }));
    await sendEmails(messages);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(firstBody).toHaveLength(100);
    expect(firstBody[0].to).toEqual(["u0@test.local"]);
  });

  it("swallows network errors", async () => {
    process.env.RESEND_API_KEY = "re_test";
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    await expect(
      sendEmails([{ to: "a@b.c", subject: "s", html: "x" }]),
    ).resolves.toBeUndefined();
  });
});

describe("updateApprovedEmail", () => {
  it("escapes content and includes product + unsubscribe links", () => {
    const { subject, html } = updateApprovedEmail({
      productName: "Kopi <script>",
      productSlug: "kopi",
      version: "v2",
      title: "Big & bold",
      body: "Hello <b>world</b>",
      unsubscribeToken: "tok123",
    });
    expect(subject).toContain("Kopi <script>"); // subjects are plain text
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Big &amp; bold");
    expect(html).toContain("/products/kopi");
    expect(html).toContain("/unwatch/tok123");
  });
});
