export type EmailMessage = { to: string; subject: string; html: string };

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Fire-and-log: email must never break the calling action. */
export async function sendEmails(messages: EmailMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Produknesia <onboarding@resend.dev>";
  if (!key) {
    console.warn(`[email] RESEND_API_KEY missing — skipped ${messages.length} email(s)`);
    return;
  }
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((m) => ({
      from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error("[email] batch failed:", res.status, await res.text());
      }
    } catch (error) {
      console.error("[email] batch error:", error);
    }
  }
}

export function updateApprovedEmail(opts: {
  productName: string;
  productSlug: string;
  version: string | null;
  title: string;
  body: string;
  unsubscribeToken: string;
}): { subject: string; html: string } {
  const productUrl = appUrl(`/products/${opts.productSlug}`);
  const unsubscribeUrl = appUrl(`/unwatch/${opts.unsubscribeToken}`);
  const versionBadge = opts.version ? ` (${escapeHtml(opts.version)})` : "";
  // Plain-text body, escaped + paragraphized — full formatting lives on the site.
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return {
    subject: `${opts.productName} — ${opts.title}`.replace(/[\r\n]+/g, " "),
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222">
  <h2 style="margin:24px 0 4px">${escapeHtml(opts.productName)}${versionBadge}</h2>
  <h3 style="margin:0 0 16px">${escapeHtml(opts.title)}</h3>
  ${paragraphs}
  <p style="margin:20px 0">
    <a href="${productUrl}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Produknesia →</a>
  </p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#777">
    <a href="${unsubscribeUrl}" style="color:#777">Unsubscribe / Berhenti berlangganan</a>
  </p>
</div>`.trim(),
  };
}
