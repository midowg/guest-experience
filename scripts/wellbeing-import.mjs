#!/usr/bin/env node
/**
 * Impor data Wellbeing lama (welbeing.netlify.app) ke tabel wb_* Journey (16 Nov 2026).
 *
 * Aplikasi lama tetap dipakai sampai Journey stabil, jadi impor ini SALINAN UJI yang bisa diulang:
 * tiap baris membawa legacy_id, impor ulang menambah yang baru, memperbarui yang berubah, dan menghapus
 * salinan yang sudah tidak ada di aplikasi lama. Aplikasi lama tetap sumber kebenaran.
 *
 *   node --env-file=.env scripts/wellbeing-import.mjs D:\projects\produk\wellbeing-export            (uji kering)
 *   node --env-file=.env scripts/wellbeing-import.mjs D:\projects\produk\wellbeing-export --apply    (menulis)
 *   ... D:\projects\produk\wellbeing-export --semua [--apply]   (dari semua-tabel.csv, lihat di bawah)
 *
 * Masukan (folder ekspor, di luar repo): csv/*_rows.csv dari dashboard Supabase lama, atau dengan --semua
 * semua-tabel.csv (hasil ekspor-semua.sql di SQL Editor: semua tabel sekali jalan, 17 Nov 2026), dan
 * cocok-karyawan.csv (hasil scripts/wellbeing-match-employees.mjs). Kolom rahasia profil tidak dibaca.
 * Keluaran: <folder>/impor-laporan.md (berisi nama, jadi tetap di luar repo).
 *
 * Aturan (docs/rancangan-wellbeing.md):
 *   - Katalog Journey disamakan dengan katalog yang sedang dipakai di aplikasi lama (nama, dimensi, poin).
 *   - Poin aktivitas = activity_points lama; langkah = langkah / 10 per aktivitas.
 *   - Penyesuaian poin sebelum 1 Jan 2026 (WIB) adalah data uji: tidak diimpor.
 *   - Total tiap orang = total di aplikasi lama tanpa data uji; selisih (pembulatan langkah, langkah dari
 *     aktivitas ditolak) dicatat sebagai satu "Penyesuaian pindah data" per orang, bertanggal awal program.
 *   - Token Strava TIDAK dipindah (dipindah saat peralihan).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseArray, readAllTables, readCsv } from "./wellbeing-csv.mjs";

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir) { console.error("Pakai: node --env-file=.env scripts/wellbeing-import.mjs <folder ekspor> [--semua] [--apply]"); process.exit(1); }
const everything = process.argv.includes("--semua") ? readAllTables(path.join(dir, "semua-tabel.csv")) : null;
const table = name => everything ? everything.get(name) ?? [] : readCsv(path.join(dir, "csv", `${name}_rows.csv`));

const DIMS = ["physical", "emotional", "social", "financial", "spiritual"];
const PROGRAM_START = "2026-05-22";
const TEST_BEFORE = Date.parse("2025-12-31T17:00:00Z"); // 1 Jan 2026 00:00 WIB
/** The export writes "2025-12-30 13:40:53.92+00": make it ISO ("T", "+00:00") before comparing instants. */
const instant = text => Date.parse(String(text).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
const isTest = row => instant(row.created_at) < TEST_BEFORE;
const wibDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const slug = text => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "kegiatan";
const uuidOf = key => { const h = crypto.createHash("sha1").update(`wellbeing-import:${key}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const num = value => value == null || value === "" ? null : Number(value);
const int = value => { const n = num(value); return n == null || Number.isNaN(n) ? null : Math.round(n); };
const clip = (text, max) => text == null ? null : String(text).slice(0, max);

/* ---------- read ---------- */
const oldDims = table("dimensions");
const oldTypes = table("activity_types");
const oldActs = table("activities");
const oldAdj = table("point_adjustments");
const oldEvents = table("admin_activities");
const oldProfiles = table("profiles").map(p => ({ id: p.id, username: p.username, full_name: p.full_name })); // nothing secret kept
const matches = readCsv(path.join(dir, "cocok-karyawan.csv"));
// Photos already moved to Journey's storage (scripts/wellbeing-storage.mjs, 18 Nov 2026): old link -> key.
const movedFile = path.join(dir, "foto-pindah.csv");
const movedPhotos = new Map(fs.existsSync(movedFile) ? readCsv(movedFile).map(row => [row.url, row.key]) : []);

const dimOf = Object.fromEntries(oldDims.map(d => [d.id, DIMS.includes(d.name) ? d.name : d.name === "mental" ? "emotional" : null]));
const employeeOf = new Map(matches.filter(m => m.employee_id).map(m => [m.old_id, m.employee_id]));
const profileName = new Map(oldProfiles.map(p => [p.id, p.full_name || p.username || p.id]));
const eventTitle = id => oldEvents.find(e => id && e.id.startsWith(id))?.title;

/* ---------- catalogue: the one in use in the old app ---------- */
const STRAVA_SPORT = { Walk: "Walking", Run: "Running", Workout: "Workout", HighIntensityIntervalTraining: "HIIT", WeightTraining: "Weight Training", Swim: "Swimming", Badminton: "Badminton", Dance: "Zumba/Aerobik", Yoga: "Yoga", Ride: "Cycling", VirtualRide: "Virtual Ride", Hike: "Hiking", TrailRun: "Trail Run" };
const catalog = new Map(); // key -> row
const keyOf = (kind, dimension, name) => kind === "sport" ? `sport|${name.toLowerCase()}` : `daily|${dimension}|${name.toLowerCase()}`;
const usedCodes = new Set();
function codeFor(kind, dimension, name) {
  const prefix = kind === "sport" ? "sport" : dimension;
  let code = `${prefix}.${slug(name)}`;
  if (code.split(".")[1].length < 2) code += "_x";
  for (let n = 2; usedCodes.has(code); n++) code = `${prefix}.${slug(name).slice(0, 44)}_${n}`;
  usedCodes.add(code);
  return code;
}
function addType({ kind, dimension, name, mode, points, active, sort, hint = "" }) {
  const key = keyOf(kind, dimension, name);
  if (catalog.has(key)) return catalog.get(key);
  const row = { code: codeFor(kind, dimension, name), dimension_id: kind === "sport" ? "physical" : dimension, kind, name: name.trim().slice(0, 200), points_mode: mode, points: mode === "fixed" ? Math.max(1, points) : 0, limit_per: mode === "steps" ? "day" : null, proof_hint: hint.slice(0, 200), active, sort_order: sort };
  catalog.set(key, row);
  return row;
}
const hintSport = "Foto layar jam atau aplikasi yang menunjukkan kalori";
for (const t of oldTypes) {
  const kind = t.mode === "sport" ? "sport" : "daily";
  const dimension = kind === "sport" ? "physical" : dimOf[t.dimension_id];
  if (kind === "daily" && !dimension) continue; // legacy rows without a dimension; added below only if used
  const mode = kind === "sport" ? "kcal" : t.requires_steps === "true" || t.name === "Steps" ? "steps" : "fixed";
  addType({ kind, dimension, name: t.name === "Steps" ? "Langkah harian" : t.name, mode, points: int(t.points) ?? 0, active: t.is_active === "true", sort: int(t.sort_order) ?? 100, hint: kind === "sport" ? hintSport : t.description && !/^Calories-based/i.test(t.description) ? t.description : "Foto, screenshot, atau bukti partisipasi" });
}

/* ---------- activities ---------- */
const report = { skipped: [], legacyTypes: [], photosCut: 0, zero: 0, unknownPeople: new Map() };
const activities = [], stepFixes = [];
for (const a of oldActs) {
  const employee = employeeOf.get(a.user_id);
  if (!employee) { report.unknownPeople.set(a.user_id, (report.unknownPeople.get(a.user_id) ?? 0) + 1); continue; }
  if (a.type === "Manual" || (a.name ?? "").startsWith("Manual Adjustment")) {
    // The old admin's step corrections (steps set to cancel wrong steps): kept as admin points, with its note.
    const steps = int(a.steps) ?? 0, pts = Math.trunc(steps / 10);
    if (pts && a.review_status === "approved") stepFixes.push({ legacy_id: `act:${a.id}`, employee_id: employee, points: pts, dimension_id: "physical", reason: clip((a.name ?? "").replace(/^Manual Adjustment:\s*/, "Koreksi langkah: ").trim() || "Koreksi langkah", 200), happened_on: wibDate(a.start_date ?? a.created_at), kind: "import", batch_id: uuidOf(`stepfix:${a.id}`), created_by_name: "Admin (aplikasi lama)", created_at: a.created_at, _old: a.user_id });
    else report.skipped.push({ id: a.id, why: "catatan admin 0 poin" });
    continue;
  }
  const sport = a.mode === "sport";
  const dimension = sport ? "physical" : dimOf[a.dimension_id] ?? "physical";
  const typeName = sport ? (a.source === "strava" ? STRAVA_SPORT[a.sport_type] ?? "Other" : a.type) : a.type === "Steps" ? "Langkah harian" : a.type;
  let type = catalog.get(keyOf(sport ? "sport" : "daily", dimension, typeName ?? "Lainnya"));
  if (!type) {
    type = addType({ kind: sport ? "sport" : "daily", dimension, name: typeName ?? "Lainnya", mode: sport ? "kcal" : "fixed", points: int(a.activity_points) || 1, active: false, sort: 900, hint: sport ? hintSport : "" });
    report.legacyTypes.push(`${type.kind}/${type.dimension_id}: ${type.name}`);
  }
  const steps = int(a.steps) ?? 0;
  const claimed = type.points_mode === "steps" ? Math.floor(steps / 10) : Math.max(0, int(a.activity_points) ?? 0);
  const status = a.review_status === "approved" ? "approved" : "rejected";
  let photos = parseArray(a.proof_urls); if (!photos.length && a.proof_url) photos = [a.proof_url];
  if (photos.length > 5) { report.photosCut++; photos = photos.slice(0, 5); }
  // Already moved to Journey's storage (wellbeing-storage.mjs): its key, not the old link again.
  photos = photos.map(url => movedPhotos.get(url) ?? url);
  const recent = Date.now() - Date.parse(a.created_at) < 7 * 86400000;
  activities.push({
    legacy_id: Number(a.id), employee_id: employee, type_code: type.code, dimension_id: type.kind === "sport" ? "physical" : dimension,
    happened_on: wibDate(a.start_date ?? a.created_at), source: a.source === "strava" ? "strava" : "import",
    title: clip(a.name && a.name !== a.type && a.name !== typeName ? a.name : "", 200) ?? "",
    steps: steps || null, kcal: int(a.calories) || null, minutes: a.moving_time ? Math.round(Number(a.moving_time) / 60) : null, distance_m: num(a.distance) ? Math.round(Number(a.distance)) : null,
    note: status === "approved" ? clip(a.review_reason ?? "", 500) : "", photos,
    points_claimed: claimed, points: claimed, status,
    review_reason: status === "rejected" ? clip(a.review_status === "voided" ? `Dibatalkan admin di aplikasi lama${a.review_reason ? `: ${a.review_reason}` : ""}` : a.review_reason || "Ditolak di aplikasi lama", 300) : null,
    reviewed_by_name: status === "rejected" ? "Aplikasi lama" : null, checked: status === "rejected" || !recent,
    external_id: a.source === "strava" ? clip(a.external_id, 64) : null, created_at: a.created_at,
    _oldPoints: a.review_status === "approved" ? int(a.activity_points) ?? 0 : 0, _oldSteps: steps, _old: a.user_id,
  });
}

/* ---------- admin points ---------- */
const entries = [], testRows = [];
for (const p of oldAdj) {
  if (isTest(p)) { testRows.push(p); continue; }
  if (!int(p.points)) { report.zero++; continue; } // 0 points change nothing (and the table refuses 0)
  const employee = employeeOf.get(p.user_id);
  if (!employee) { report.unknownPeople.set(p.user_id, (report.unknownPeople.get(p.user_id) ?? 0) + 1); continue; }
  const attendance = /^Activity Attendance \[([0-9a-f-]+)/.exec(p.reason ?? "");
  const reason = attendance ? `Kehadiran: ${eventTitle(attendance[1]) ?? "acara"}` : (p.reason ?? "").replace(/^Activity Attendance: /, "Kehadiran: ").trim() || "Penyesuaian";
  const minute = p.created_at.slice(0, 16);
  entries.push({
    legacy_id: p.id, employee_id: employee, points: int(p.points), dimension_id: dimOf[p.dimension_id] ?? null, reason: clip(reason, 200),
    happened_on: wibDate(p.created_at), kind: "import", batch_id: uuidOf(`batch:${reason}:${minute}`),
    created_by_name: clip(`${p.admin_id ? profileName.get(p.admin_id) ?? "Admin" : "Admin"} (aplikasi lama)`, 150), created_at: p.created_at, _old: p.user_id,
  });
}

/* ---------- totals: old formula vs imported, and the reconciliation per person ---------- */
const people = new Map();
const person = id => { if (!people.has(id)) people.set(id, { old: id, name: profileName.get(id), oldSteps: 0, oldActPts: 0, oldAdj: 0, testAdj: 0, newAct: 0, newEntries: 0, acts: 0 }); return people.get(id); };
for (const a of oldActs) { const p = person(a.user_id); p.oldSteps += int(a.steps) ?? 0; if (a.review_status === "approved") p.oldActPts += int(a.activity_points) ?? 0; }
for (const a of oldAdj) { const p = person(a.user_id); p.oldAdj += int(a.points) ?? 0; if (isTest(a)) p.testAdj += int(a.points) ?? 0; }
for (const a of activities) { const p = person(a._old); p.acts++; if (a.status !== "rejected") p.newAct += a.points; }
for (const e of [...entries, ...stepFixes]) person(e._old).newEntries += e.points;
const reconcile = [];
for (const p of people.values()) {
  p.oldTotal = Math.floor(p.oldSteps / 10) + p.oldActPts + p.oldAdj;
  p.target = p.oldTotal - p.testAdj;
  p.diff = p.target - p.newAct - p.newEntries;
  const employee = employeeOf.get(p.old);
  if (employee && p.diff !== 0) reconcile.push({ legacy_id: `reconcile:${p.old}`, employee_id: employee, points: p.diff, dimension_id: null, reason: "Penyesuaian pindah data (hitungan langkah aplikasi lama)", happened_on: PROGRAM_START, kind: "import", batch_id: uuidOf("reconcile"), created_by_name: "Pindah data", created_at: new Date().toISOString() });
}

/* ---------- check every row against the table rules before anything is written ---------- */
const problems = [];
const typeCodes = new Set([...catalog.values()].map(t => t.code));
for (const t of catalog.values()) {
  if (!/^[a-z]+\.[a-z0-9_]{2,60}$/.test(t.code)) problems.push(`kode katalog tidak sah: ${t.code}`);
  if (t.points_mode === "fixed" && t.points < 1) problems.push(`poin tetap 0: ${t.code}`);
}
for (const a of activities) {
  if (!typeCodes.has(a.type_code)) problems.push(`aktivitas ${a.legacy_id}: jenis ${a.type_code} tidak ada`);
  if (a.points < 0 || a.points > 100000 || a.points_claimed < 0) problems.push(`aktivitas ${a.legacy_id}: poin ${a.points}`);
  if (a.steps != null && (a.steps < 0 || a.steps > 200000)) problems.push(`aktivitas ${a.legacy_id}: langkah ${a.steps}`);
  if (a.kcal != null && (a.kcal < 0 || a.kcal > 20000)) problems.push(`aktivitas ${a.legacy_id}: kalori ${a.kcal}`);
  if (a.minutes != null && (a.minutes < 0 || a.minutes > 1440)) a.minutes = Math.min(1440, Math.max(0, a.minutes));
  if (a.distance_m != null && (a.distance_m < 0 || a.distance_m > 1000000)) a.distance_m = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.happened_on)) problems.push(`aktivitas ${a.legacy_id}: tanggal ${a.happened_on}`);
}
for (const e of [...entries, ...stepFixes, ...reconcile]) {
  if (!e.points || e.points < -100000 || e.points > 100000) problems.push(`poin ${e.legacy_id}: ${e.points}`);
  if (!e.reason || e.reason.trim().length < 2) problems.push(`poin ${e.legacy_id}: alasan kosong`);
}
if (problems.length) { console.error(`Berhenti: ${problems.length} baris tidak sesuai aturan tabel, tidak ada yang ditulis.\n- ${problems.slice(0, 30).join("\n- ")}`); process.exit(1); }

/* ---------- report ---------- */
const rows = [...people.values()].filter(p => p.oldTotal || p.acts).sort((a, b) => b.target - a.target);
const sum = (list, key) => list.reduce((s, x) => s + (x[key] ?? 0), 0);
const lines = [
  `# Laporan impor Wellbeing (${apply ? "DITULIS" : "uji kering"})`, "", `Dibuat: ${new Date().toISOString()}`, "",
  `- Katalog: ${catalog.size} jenis (${[...catalog.values()].filter(t => t.active).length} aktif), dari katalog yang dipakai di aplikasi lama.`,
  `- Aktivitas: ${activities.length} diimpor dari ${oldActs.length} (${activities.filter(a => a.status === "rejected").length} ditolak/dibatalkan, ${activities.filter(a => a.source === "strava").length} dari Strava, ${activities.filter(a => !a.checked).length} ditandai belum diperiksa: 7 hari terakhir).`,
  `- Koreksi langkah admin lama ("Manual Adjustment"): ${stepFixes.length} jadi poin admin (${sum(stepFixes, "points")} poin); ${report.skipped.length} catatan 0 poin dilewati.`,
  `- Dilewati: ${[...report.unknownPeople.values()].reduce((s, n) => s + n, 0)} baris milik ${report.unknownPeople.size} profil yang sudah dihapus di aplikasi lama atau tanpa pasangan karyawan.`,
  `- Penyesuaian poin: ${entries.length} diimpor, ${testRows.length} data uji sebelum 1 Jan 2026 tidak diimpor (${sum(testRows.map(t => ({ p: int(t.points) })), "p")} poin), ${report.zero} bernilai 0 dilewati.`,
  `- Penyesuaian pindah data (langkah dari aktivitas ditolak dan pembulatan, seperti hitungan aplikasi lama): ${reconcile.length} orang, total ${sum(reconcile, "points")} poin.`,
  `- Foto: ${activities.reduce((s, a) => s + a.photos.length, 0)} (sudah di storage Journey: ${activities.reduce((s, a) => s + a.photos.filter(p => !/^https?:\/\//i.test(p)).length, 0)}; sisanya tautan ke bucket lama, pindahkan dengan scripts/wellbeing-storage.mjs); ${report.photosCut} aktivitas punya lebih dari 5 foto (dipotong jadi 5).`,
  report.legacyTypes.length ? `- Jenis lama yang tidak ada di katalog (dibuat nonaktif): ${report.legacyTypes.join("; ")}` : "- Semua aktivitas cocok dengan katalog.",
  "", "| Nama (aplikasi lama) | Aktivitas | Total lama | Data uji | Target | Aktivitas baru | Poin admin | Penyesuaian | Total baru |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...rows.map(p => `| ${p.name ?? "(profil sudah dihapus)"}${employeeOf.get(p.old) ? "" : " ⚠ tidak diimpor"} | ${p.acts} | ${p.oldTotal} | ${p.testAdj || ""} | ${p.target} | ${p.newAct} | ${p.newEntries} | ${p.diff || ""} | ${employeeOf.get(p.old) ? p.newAct + p.newEntries + p.diff : "-"} |`),
];
fs.writeFileSync(path.join(dir, "impor-laporan.md"), lines.join("\n"));
console.log(lines.slice(0, 11).join("\n"));
console.log(`\nLaporan lengkap: ${path.join(dir, "impor-laporan.md")}`);
if (!apply) { console.log("\nUji kering: tidak ada yang ditulis. Tambahkan --apply untuk menulis."); process.exit(0); }

/* ---------- write (only with --apply) ---------- */
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const must = (result, what) => { if (result.error) { console.error(`Gagal ${what}:`, result.error.message); process.exit(1); } return result.data; };
/** Every row of a query, 1000 at a time (PostgREST answers at most 1000 per request). */
const all = async (query, what) => { const rows = []; for (let from = 0; ; from += 1000) { const page = must(await query().range(from, from + 999), what); rows.push(...page); if (page.length < 1000) return rows; } };
const strip = row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_")));
const chunks = (list, size = 400) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

// 1. Catalogue: upsert ours, then remove the first seed's rows nothing uses and the old app does not have.
must(await db.from("wb_activity_types").upsert([...catalog.values()].map(t => ({ ...t, updated_at: new Date().toISOString() })), { onConflict: "code" }), "menyimpan katalog");
const existingTypes = (await all(() => db.from("wb_activity_types").select("code").order("code"), "membaca katalog")).map(t => t.code);
const usedTypes = new Set((await all(() => db.from("wb_activities").select("type_code").order("id"), "membaca aktivitas")).map(a => a.type_code));
const extra = existingTypes.filter(code => ![...catalog.values()].some(t => t.code === code));
const removable = extra.filter(code => !usedTypes.has(code));
if (removable.length) must(await db.from("wb_activity_types").delete().in("code", removable), "merapikan katalog");
if (extra.length - removable.length) must(await db.from("wb_activity_types").update({ active: false }).in("code", extra.filter(code => usedTypes.has(code))), "menonaktifkan katalog lama");

// 2. Activities by legacy_id: insert new, update existing (data only; `checked` stays as tested), delete gone.
// A Strava activity the WLM Strava sync already brought in (no legacy_id, the same Strava id: someone
// connected Strava in WLM before this run) is adopted, not inserted again, which the unique
// (source, external_id) would refuse: it takes the old id and is then updated like any imported row
// (the old app stays the truth until the cutover). Strava activities the old app never had stay WLM's own.
const oldStrava = new Map(activities.filter(a => a.source === "strava" && a.external_id).map(a => [a.external_id, a]));
let adopted = 0;
for (const part of chunks([...oldStrava.keys()])) {
  const synced = must(await db.from("wb_activities").select("id,external_id").eq("source", "strava").is("legacy_id", null).in("external_id", part), "membaca aktivitas Strava dari WLM");
  for (const row of synced) {
    must(await db.from("wb_activities").update({ legacy_id: oldStrava.get(row.external_id).legacy_id }).eq("id", row.id), "mengambil alih aktivitas Strava dari WLM");
    adopted++;
  }
}
const haveActs =new Map((await all(() => db.from("wb_activities").select("id,legacy_id").not("legacy_id", "is", null).order("id"), "membaca aktivitas impor")).map(r => [Number(r.legacy_id), r.id]));
const newActs = activities.filter(a => !haveActs.has(a.legacy_id)).map(strip);
for (const part of chunks(newActs)) must(await db.from("wb_activities").insert(part), "menyimpan aktivitas");
let updated = 0;
for (const a of activities.filter(a => haveActs.has(a.legacy_id))) {
  const data = strip(a); delete data.checked; delete data.created_at; // keep the tested `checked` and the old time
  must(await db.from("wb_activities").update({ ...data, updated_at: new Date().toISOString() }).eq("id", haveActs.get(a.legacy_id)), "memperbarui aktivitas"); updated++;
}
const keepActs = new Set(activities.map(a => a.legacy_id));
const goneActs = [...haveActs.keys()].filter(id => !keepActs.has(id));
for (const part of chunks(goneActs)) must(await db.from("wb_activities").delete().in("legacy_id", part), "menghapus aktivitas yang sudah tidak ada");

// 3. Admin points and the reconciliation, the same way.
const allEntries = [...entries, ...stepFixes, ...reconcile];
const haveEntries = new Map((await all(() => db.from("wb_point_entries").select("id,legacy_id").not("legacy_id", "is", null).order("id"), "membaca poin impor")).map(r => [r.legacy_id, r.id]));
for (const part of chunks(allEntries.filter(e => !haveEntries.has(e.legacy_id)).map(strip))) must(await db.from("wb_point_entries").insert(part), "menyimpan poin");
for (const e of allEntries.filter(e => haveEntries.has(e.legacy_id))) {
  const data = strip(e); delete data.created_at;
  must(await db.from("wb_point_entries").update({ ...data, voided_at: null, voided_by_name: null }).eq("id", haveEntries.get(e.legacy_id)), "memperbarui poin");
}
const keepEntries = new Set(allEntries.map(e => e.legacy_id));
const goneEntries = [...haveEntries.keys()].filter(id => !keepEntries.has(id));
for (const part of chunks(goneEntries)) must(await db.from("wb_point_entries").delete().in("legacy_id", part), "menghapus poin yang sudah tidak ada");

console.log(`\nDitulis: katalog ${catalog.size} (dirapikan ${removable.length}), aktivitas +${newActs.length} / diperbarui ${updated} (${adopted} dari sinkron Strava WLM diambil alih) / dihapus ${goneActs.length}, poin +${allEntries.filter(e => !haveEntries.has(e.legacy_id)).length} / dihapus ${goneEntries.length}.`);
