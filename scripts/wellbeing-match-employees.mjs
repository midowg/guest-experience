#!/usr/bin/env node
/**
 * Cocokkan profil Wellbeing lama ke data karyawan Journey (employees + akun WAM). BACA SAJA.
 *
 *   node scripts/wellbeing-match-employees.mjs D:\projects\produk\wellbeing-export
 *
 * Membaca <folder>/profil-ringkas.csv (ekspor dari Supabase lama, tanpa kolom rahasia), membaca employees dan
 * pw_accounts dari Supabase Journey (kunci di .env repo ini), lalu menulis <folder>/cocok-karyawan.csv:
 *   pasti = nama lengkap sama persis / nama login WAM sama
 *   kuat  = nama panggilan sama dan hanya satu karyawan
 *   ragu  = beberapa kandidat (nama panggilan atau nama depan sama)
 *   tidak = tidak ada kandidat
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = process.argv[2];
if (!dir) { console.error("Pakai: node scripts/wellbeing-match-employees.mjs <folder ekspor>"); process.exit(1); }
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// CSV sederhana (nilai di ekspor ini tidak berisi koma di dalam tanda kutip).
const parseCsv = text => {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map(l => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v === "null" ? null : v])));
};
const profiles = parseCsv(fs.readFileSync(path.join(dir, "profil-ringkas.csv"), "utf8"));

const { data: employees, error: e1 } = await db.from("employees").select("id, full_name, nickname, department, position, category, active");
if (e1) { console.error("Gagal membaca employees:", e1.message); process.exit(1); }
const { data: accounts, error: e2 } = await db.from("pw_accounts").select("employee_id, login_name, active");
if (e2) { console.error("Gagal membaca pw_accounts:", e2.message); process.exit(1); }
const loginOf = new Map(accounts.map(a => [a.employee_id, a.login_name]));

const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const people = employees.map(e => ({ ...e, login: loginOf.get(e.id) || null, hasAccount: loginOf.has(e.id),
  nFull: norm(e.full_name), nNick: norm(e.nickname), first: norm(e.full_name).split(" ")[0] }));
const label = e => `${e.full_name}${e.nickname ? ` (${e.nickname})` : ""} · ${e.department || "-"}${e.active ? "" : " · NONAKTIF"}${e.hasAccount ? "" : " · tanpa akun WAM"}`;

const rows = profiles.map(p => {
  const full = norm(p.full_name), user = norm(p.username);
  let status = "tidak", picks = [];
  const exact = people.filter(e => full.includes(" ") && e.nFull === full);
  const login = people.filter(e => e.login && (e.login === user || e.login === full.replace(/ /g, "")));
  if (exact.length === 1) { status = "pasti"; picks = exact; }
  else if (login.length === 1) { status = "pasti"; picks = login; }
  else {
    const keys = [...new Set([full, user].filter(Boolean))];
    const nick = people.filter(e => e.nNick && keys.includes(e.nNick));
    const nickActive = nick.filter(e => e.active);
    if (nickActive.length === 1) { status = "kuat"; picks = nickActive; }
    else if (nick.length) { status = "ragu"; picks = nick; }
    else {
      const first = people.filter(e => keys.includes(e.first) || (full.includes(" ") && e.nFull.includes(full)));
      if (first.length) { status = "ragu"; picks = first; }
    }
  }
  return { ...p, status, kandidat: picks.map(label), employee_id: picks.length === 1 ? picks[0].id : "" };
});

const esc = v => /[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
const out = ["status,old_id,username,full_name,jumlah_aktivitas,aktivitas_terakhir,employee_id,kandidat",
  ...rows.sort((a, b) => ["tidak", "ragu", "kuat", "pasti"].indexOf(a.status) - ["tidak", "ragu", "kuat", "pasti"].indexOf(b.status))
    .map(r => [r.status, r.id, r.username, r.full_name, r.jumlah_aktivitas, (r.aktivitas_terakhir || "").slice(0, 10), r.employee_id, r.kandidat.join(" | ")].map(esc).join(","))];
fs.writeFileSync(path.join(dir, "cocok-karyawan.csv"), out.join("\n"));

const count = s => rows.filter(r => r.status === s).length;
console.log(`Karyawan Journey: ${employees.length} (${employees.filter(e => e.active).length} aktif, ${accounts.length} akun WAM)`);
console.log(`Profil lama: ${rows.length} → pasti ${count("pasti")}, kuat ${count("kuat")}, ragu ${count("ragu")}, tidak ${count("tidak")}`);
for (const r of rows.filter(r => r.status === "ragu" || r.status === "tidak")) {
  console.log(`  [${r.status}] ${r.full_name} (${r.username}, ${r.jumlah_aktivitas} aktivitas): ${r.kandidat.join(" | ") || "-"}`);
}
console.log("Kuat (cek sekilas):");
for (const r of rows.filter(r => r.status === "kuat")) console.log(`  ${r.full_name} → ${r.kandidat[0]}`);
process.exit(0);
