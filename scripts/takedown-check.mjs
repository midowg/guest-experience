// Development-only end-to-end check of the take-down: read what the front page shows,
// clear the selection, read again, then restore exactly what was there before.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const page = async () => {
  const html = await (await fetch(site, { cache: "no-store" })).text();
  return {
    showsEvent: html.includes("event-title"),
    showsEmptyState: html.includes("belum ada undangan yang sedang ditayangkan"),
    linksToAdmin: /href="\/admin/.test(html),
  };
};

const before = await admin.from("site_settings").select("featured_event_id").maybeSingle();
const original = before.data?.featured_event_id ?? null;
console.log("acara tayang saat ini:", original ?? "tidak ada");

const rows = [];
const record = async (label) => rows.push({ keadaan: label, ...(await page()) });

if (original) await record("sebelum diturunkan");

// Take it down exactly the way the admin button does.
const { error: downError } = await admin.from("site_settings").update({ featured_event_id: null }).eq("id", true);
if (downError) { console.log("gagal menurunkan:", downError.message); process.exit(1); }
await record("setelah diturunkan");

// Restore, so this check leaves nothing changed.
if (original) {
  const { error: upError } = await admin.from("site_settings").update({ featured_event_id: original }).eq("id", true);
  if (upError) { console.log("GAGAL MENGEMBALIKAN — kembalikan manual:", original, upError.message); process.exit(1); }
  await record("setelah dikembalikan");
}

console.table(rows);
const after = await admin.from("site_settings").select("featured_event_id").maybeSingle();
const restored = (after.data?.featured_event_id ?? null) === original;
console.log(restored ? "Keadaan semula dikembalikan." : "PERINGATAN: keadaan tidak kembali seperti semula.");
const downRow = rows.find(row => row.keadaan === "setelah diturunkan");
console.log(downRow.showsEmptyState && !downRow.showsEvent && !downRow.linksToAdmin
  ? "Take-down bekerja: halaman kosong, tanpa tautan admin."
  : "PEMERIKSAAN GAGAL pada keadaan diturunkan.");
process.exit(0);
