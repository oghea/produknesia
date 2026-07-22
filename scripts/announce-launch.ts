// Launch announcement — dry-runs by default; pass --yes to send.
import { config } from "dotenv";
config({ path: [".env.local"] });

async function main() {
  const { db } = await import("../src/db/index");
  const { users } = await import("../src/db/schema");
  const { isNotNull } = await import("drizzle-orm");
  const { listSubscriberEmails } = await import("../src/db/queries/waitlist");
  const { sendEmails } = await import("../src/lib/email");

  const subscriberEmails = await listSubscriberEmails();
  const userRows = await db
    .select({ email: users.email })
    .from(users)
    .where(isNotNull(users.email));
  const recipients = [
    ...new Set([
      ...subscriberEmails,
      ...userRows.map((r) => r.email as string),
    ]),
  ];

  const base = process.env.APP_URL ?? "https://produknesia.antaras.io";
  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222">
  <h2 style="margin:24px 0 8px">Panggungnya dibuka. 🚀</h2>
  <p>Produknesia resmi diluncurkan — panggung tempat karya anak bangsa
  launch lebih dulu. 100+ produk Indonesia sudah menunggu untuk kamu
  temukan, dukung, dan diskusikan.</p>
  <p style="margin:20px 0">
    <a href="${base}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Jelajahi Produknesia →</a>
  </p>
  <p style="color:#555">The stage is open: Produknesia has launched —
  100+ Indonesian products are waiting to be discovered.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:12px;color:#777">Kamu menerima email ini karena
  mendaftar di daftar tunggu atau punya akun Produknesia. Abaikan jika
  tidak merasa mendaftar. / You received this because you joined the
  waitlist or have a Produknesia account; ignore it if unexpected.</p>
</div>`.trim();

  console.log(`Recipients: ${recipients.length}`);
  if (!process.argv.includes("--yes")) {
    console.log("Dry run — pass --yes to send.");
    process.exit(0);
  }
  await sendEmails(
    recipients.map((to) => ({
      to,
      subject: "Produknesia sudah diluncurkan 🚀",
      html,
    })),
  );
  console.log("Sent.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
