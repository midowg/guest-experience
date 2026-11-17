#!/usr/bin/env node
/**
 * Hadiah dari aplikasi Wellbeing lama ke Journey sebagai DRAF (18 Nov 2026, keputusan pemilik).
 *
 *   node --env-file=.env scripts/wellbeing-rewards-import.mjs <folder ekspor>            uji kering
 *   node --env-file=.env scripts/wellbeing-rewards-import.mjs <folder ekspor> --apply    menulis
 *
 * Membaca tabel rewards dari <folder>/semua-tabel.csv (ekspor-semua.sql) dan membawa hadiah sungguhan
 * saja: yang punya gambar dan bukan item sistem. Item permainan acara lama (Avatar Reroll, Background
 * Reroll, Reveal Spot Clues) tidak dibawa. Tiap hadiah masuk ke wb_rewards NONAKTIF (draf) dengan
 * legacy_id = id lama: nama, keterangan, harga (required_points), stok (max_claims; 0 = tanpa batas),
 * 1 kali per orang, foto berupa tautan lama (dipindah ke R2 oleh scripts/wellbeing-storage.mjs).
 * Bisa diulang: hadiah yang sudah ada (legacy_id sama) TIDAK ditimpa, karena admin mungkin sudah
 * mengubahnya. Klaim lama (satu klaim item permainan) tidak dibawa.
 */
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readAllTables } from "./wellbeing-csv.mjs";

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir || dir.startsWith("--")) { console.error("Pakai: node --env-file=.env scripts/wellbeing-rewards-import.mjs <folder ekspor> [--apply]"); process.exit(1); }

const old = readAllTables(path.join(dir, "semua-tabel.csv")).get("rewards") ?? [];
const GAME = /reroll|clue/i;
const picked = old.filter(row => row.image_url && row.is_system !== "true" && !GAME.test(row.title ?? ""));
const skipped = old.filter(row => !picked.includes(row));
const int = value => { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : 0; };
const rows = picked.map((row, index) => ({
  legacy_id: `reward:${row.id}`, title: String(row.title).trim().slice(0, 120), description: String(row.description ?? "").trim().slice(0, 2000),
  photos: [row.image_url], cost: Math.max(1, int(row.required_points)), stock: int(row.max_claims) > 0 ? int(row.max_claims) : null, per_person: 1,
  active: false, sort: 100 + index, updated_by_name: "Pindah data",
}));

console.log(`Hadiah lama: ${old.length}. Dibawa sebagai draf: ${rows.length}. Tidak dibawa: ${skipped.map(row => row.title).join(", ") || "-"}.`);
for (const row of rows) console.log(`  - ${row.title}: ${row.cost.toLocaleString("id-ID")} poin, stok ${row.stock ?? "tanpa batas"}, foto ${new URL(row.photos[0]).host}`);
if (!apply) { console.log("Uji kering: belum ada yang ditulis. Ulangi dengan --apply."); process.exit(0); }

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) { console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY (Journey) belum ada di .env."); process.exit(1); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const have = await db.from("wb_rewards").select("legacy_id").not("legacy_id", "is", null);
if (have.error) { console.error(`Gagal membaca wb_rewards (sudah jalankan migrasi 202611180001?): ${have.error.message}`); process.exit(1); }
const existing = new Set((have.data ?? []).map(row => row.legacy_id));
const fresh = rows.filter(row => !existing.has(row.legacy_id));
if (fresh.length) {
  const { error } = await db.from("wb_rewards").insert(fresh);
  if (error) { console.error(`Gagal menyimpan: ${error.message}`); process.exit(1); }
}
console.log(`Ditulis: ${fresh.length} draf baru, ${rows.length - fresh.length} sudah ada (dibiarkan). Cek dan nyalakan di Admin WLM → Hadiah → Katalog.`);
