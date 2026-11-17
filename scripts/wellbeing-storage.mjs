#!/usr/bin/env node
/**
 * Pindah storage Wellbeing lama ke Journey (18 Nov 2026), supaya project Supabase lama bisa diarsipkan.
 *
 *   node --env-file=.env scripts/wellbeing-storage.mjs <folder ekspor>                    uji kering foto bukti
 *   node --env-file=.env scripts/wellbeing-storage.mjs <folder ekspor> --apply            salin foto + ganti tautan
 *   node --env-file=.env scripts/wellbeing-storage.mjs <folder ekspor> --arsip [--apply]  semua isi storage lama
 *
 * 1. Foto bukti (bawaan). Tiap foto aktivitas di Journey (wb_activities.photos) yang masih berupa tautan ke
 *    storage aplikasi lama diunduh, dicek benar foto (byte awalnya), disimpan di R2 Journey sebagai
 *    wellbeing/<karyawan>/<id tetap dari tautan>.<ext>, dicek ukurannya, lalu tautan di aktivitas diganti
 *    kunci baru. Bisa diulang: kunci yang sudah ada dengan ukuran sama dilewati. Daftar tautan lama -> kunci
 *    baru ditulis ke <folder>/foto-pindah.csv; wellbeing-import.mjs memakainya supaya impor ulang tidak
 *    mengembalikan tautan lama. Uji kering hanya membaca: tiap tautan dicoba (32 byte pertama), tanpa menulis.
 *    Hadiah (18 Nov 2026): foto hadiah yang masih tautan (hadiah lama yang dibawa sebagai draf) ikut
 *    disalin, ke wellbeing/hadiah/<id tetap dari tautan>.<ext>, lalu tautannya di wb_rewards diganti.
 * 2. --arsip. Semua bucket dan berkas storage lama (juga yang tidak dipakai aktivitas: avatar, berkas acara)
 *    disalin ke R2 arsip/wellbeing-lama/<bucket>/<path>, di luar wellbeing/ sehingga tidak pernah ditampilkan
 *    aplikasi. Daftar di <folder>/arsip-storage.csv. Perlu kunci project lama di <folder>/akses.env
 *    (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), diisi sementara oleh pemilik lalu dikosongkan lagi.
 *
 * Perlu di .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (Journey), dan untuk --apply R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (sama dengan di Vercel). Tidak ada yang dihapus: storage
 * lama tetap utuh sampai pemilik mengarsipkan project-nya (langkahnya di docs/rancangan-wellbeing.md).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readCsv } from "./wellbeing-csv.mjs";
import { archiveKey, csvText, isLink, KINDS, megabytes, movePhotos, photoKey, rewardPhotoKeyOf, sniffKind } from "./wellbeing-storage-lib.mjs";

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
const archive = process.argv.includes("--arsip");
if (!dir || dir.startsWith("--")) { console.error("Pakai: node --env-file=.env scripts/wellbeing-storage.mjs <folder ekspor> [--arsip] [--apply]"); process.exit(1); }

const env = process.env;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) { console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY (Journey) belum ada di .env."); process.exit(1); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const r2Ready = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every(name => env[name]?.trim());
if (apply && !r2Ready) { console.error("Untuk --apply isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET di .env (nilainya sama dengan di Vercel)."); process.exit(1); }
const bucket = env.R2_BUCKET?.trim();
const r2 = r2Ready ? new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim() } }) : null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Runs `work` over the items, `size` at a time. */
async function pool(items, size, work) {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
      if (++done % 200 === 0) console.log(`  ... ${done} / ${items.length}`);
    }
  }));
}
/** Three tries for network trouble; a missing file (404) is an answer, not a failure to retry. */
async function retry(work) {
  for (let attempt = 1; ; attempt++) {
    try { return await work(); } catch (error) { if (error.final || attempt >= 3) throw error; await sleep(1500 * attempt); }
  }
}
const final = message => Object.assign(new Error(message), { final: true });
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sizeInR2 = async key => (await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null))?.ContentLength ?? null;
async function putR2(key, bytes, contentType, source) {
  await retry(() => r2.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.length, Metadata: { "asal": encodeURI(source).slice(0, 1024) } })));
  const size = await sizeInR2(key);
  if (size !== bytes.length) throw final(`ukuran di R2 ${size}, seharusnya ${bytes.length}`);
}
async function all(query, label) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) { console.error(`Gagal ${label}: ${error.message}`); process.exit(1); }
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/* ---------- 1. proof photos ---------- */
const manifestFile = path.join(dir, "foto-pindah.csv");
const manifest = new Map(fs.existsSync(manifestFile) ? readCsv(manifestFile).map(row => [row.url, row]) : []);
const activities = (await all(() => db.from("wb_activities").select("id,employee_id,photos").order("id"), "membaca aktivitas")).filter(a => (a.photos ?? []).some(isLink));
// Hadiah (18 Nov 2026): prizes brought over from the old app keep their photo links until moved here too.
const rewardsRead = await db.from("wb_rewards").select("id,photos").order("id");
const rewards = rewardsRead.error ? [] : (rewardsRead.data ?? []).filter(r => (r.photos ?? []).some(isLink));
if (rewardsRead.error) console.log(`(Hadiah dilewati: ${rewardsRead.error.message})`);
const links = new Map(); // url -> the employee whose activity has it, or "hadiah" (for the key)
for (const a of activities) for (const url of a.photos.filter(isLink)) if (!links.has(url)) links.set(url, a.employee_id);
for (const r of rewards) for (const url of r.photos.filter(isLink)) if (!links.has(url)) links.set(url, "hadiah");
const keyFor = (owner, url, ext) => owner === "hadiah" ? rewardPhotoKeyOf(url, ext) : photoKey(owner, url, ext);
const hosts = new Map(); for (const url of links.keys()) { const host = new URL(url).host; hosts.set(host, (hosts.get(host) ?? 0) + 1); }

console.log(`Foto bukti dan hadiah: ${links.size} tautan lama di ${activities.length} aktivitas dan ${rewards.length} hadiah (${[...hosts].map(([host, n]) => `${host}: ${n}`).join(", ") || "-"}).`);
const problems = [], kinds = new Map();
let bytesTotal = 0, copied = 0, already = 0;

await pool([...links], 8, async ([url, employeeId]) => {
  try {
    if (!apply) {
      // Read only: the first bytes say whether it is still there and a photo; the size comes with them.
      const res = await retry(async () => {
        const answer = await fetch(url, { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(30_000) });
        if (answer.status === 404 || answer.status === 400) throw final(`tidak ada (${answer.status})`);
        if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
        return answer;
      });
      const head = new Uint8Array(await res.arrayBuffer());
      const kind = sniffKind(head);
      if (!kind) throw final("bukan foto atau video yang dikenal");
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      bytesTotal += Number(/\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1] ?? res.headers.get("content-length") ?? 0);
      if (r2 && (await sizeInR2(keyFor(employeeId, url, KINDS[kind].ext))) != null) already++;
      return;
    }
    const known = manifest.get(url);
    if (known && (await sizeInR2(known.key)) === Number(known.bytes)) { already++; bytesTotal += Number(known.bytes); kinds.set(known.kind, (kinds.get(known.kind) ?? 0) + 1); return; }
    const bytes = await retry(async () => {
      const answer = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (answer.status === 404 || answer.status === 400) throw final(`tidak ada (${answer.status})`);
      if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
      return new Uint8Array(await answer.arrayBuffer());
    });
    const kind = sniffKind(bytes);
    if (!kind) throw final("bukan foto atau video yang dikenal");
    const key = keyFor(employeeId, url, KINDS[kind].ext);
    if ((await sizeInR2(key)) === bytes.length) already++;
    else { await putR2(key, bytes, KINDS[kind].mime, url); copied++; }
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    bytesTotal += bytes.length;
    manifest.set(url, { url, key, bytes: bytes.length, sha256: sha256(bytes), kind });
  } catch (error) {
    problems.push(`${url}: ${error.message}`);
  }
});

console.log(`  jenis: ${[...kinds].map(([kind, n]) => `${kind} ${n}`).join(", ") || "-"}; ukuran ${megabytes(bytesTotal)}`);
if (!apply) console.log(r2 ? `  sudah ada di R2 Journey: ${already}` : "  (R2 belum diisi di .env: belum bisa dicek mana yang sudah tersalin)");
else console.log(`  disalin ke R2: ${copied}, sudah ada sebelumnya: ${already}`);
if (problems.length) { console.log(`  BERMASALAH ${problems.length} (tetap memakai tautan lama, ikut hilang saat project lama diarsipkan):`); for (const line of problems) console.log(`    - ${line}`); }

if (apply) {
  fs.writeFileSync(manifestFile, csvText(["url", "key", "bytes", "sha256", "kind"], [...manifest.values()]));
  const moved = new Map([...manifest.values()].map(row => [row.url, row.key]));
  let updated = 0;
  await pool(activities, 6, async a => {
    const next = movePhotos(a.photos, moved);
    if (!next.changed) return;
    const { error } = await db.from("wb_activities").update({ photos: next.photos }).eq("id", a.id);
    if (error) problems.push(`aktivitas ${a.id}: ${error.message}`); else updated++;
  });
  let rewardsUpdated = 0;
  for (const r of rewards) {
    const next = movePhotos(r.photos, moved);
    if (!next.changed) continue;
    const { error } = await db.from("wb_rewards").update({ photos: next.photos }).eq("id", r.id);
    if (error) problems.push(`hadiah ${r.id}: ${error.message}`); else rewardsUpdated++;
  }
  const after = [
    ...(await all(() => db.from("wb_activities").select("photos").order("id"), "memeriksa ulang")).flatMap(a => (a.photos ?? []).filter(isLink)),
    ...(rewardsRead.error ? [] : ((await db.from("wb_rewards").select("photos")).data ?? []).flatMap(r => (r.photos ?? []).filter(isLink))),
  ];
  console.log(`  aktivitas diperbarui: ${updated}, hadiah diperbarui: ${rewardsUpdated}; daftar: ${manifestFile}`);
  console.log(`  TAUTAN LAMA TERSISA DI JOURNEY: ${after.length}${after.length ? " (jalankan lagi, atau lihat yang bermasalah)" : " (foto bukti tidak lagi bergantung pada project lama)"}`);
}

/* ---------- 2. everything in the old storage, for the archive ---------- */
if (archive) {
  const access = fs.existsSync(path.join(dir, "akses.env"))
    ? Object.fromEntries(fs.readFileSync(path.join(dir, "akses.env"), "utf8").split(/\r?\n/).map(line => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())).filter(Boolean).map(m => [m[1], m[2].trim()]))
    : {};
  if (!access.SUPABASE_URL || !access.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`\n--arsip: isi sementara SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY project lama di ${path.join(dir, "akses.env")} (Supabase lama → Project Settings → API), lalu kosongkan lagi setelah selesai.`);
    process.exit(1);
  }
  const old = createClient(access.SUPABASE_URL, access.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: buckets, error } = await old.storage.listBuckets();
  if (error) { console.error(`Gagal membaca bucket lama: ${error.message}`); process.exit(1); }
  const files = [];
  async function walk(name, prefix) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error: listError } = await old.storage.from(name).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (listError) { console.error(`Gagal membaca ${name}/${prefix}: ${listError.message}`); process.exit(1); }
      for (const entry of data) {
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) await walk(name, objectPath); // a folder
        else files.push({ bucket: name, path: objectPath, size: entry.metadata?.size ?? 0, mime: entry.metadata?.mimetype ?? "application/octet-stream" });
      }
      if (data.length < 1000) return;
    }
  }
  for (const b of buckets) await walk(b.name, "");
  console.log(`\nArsip storage lama: ${files.length} berkas, ${megabytes(files.reduce((sum, f) => sum + f.size, 0))}`);
  for (const b of buckets) { const own = files.filter(f => f.bucket === b.name); console.log(`  ${b.name}${b.public ? " (publik)" : ""}: ${own.length} berkas, ${megabytes(own.reduce((sum, f) => sum + f.size, 0))}`); }
  if (!apply) { console.log("  (uji kering: belum ada yang disalin)"); }
  else {
    const listFile = path.join(dir, "arsip-storage.csv");
    const listed = [], failed = [];
    let copiedFiles = 0, skipped = 0, alreadyMoved = 0;
    // Proof photos moved in step 1 are already in Journey's storage: listed with that key, not stored twice.
    const movedAt = new Map([...manifest.values()].map(row => [decodeURI(new URL(row.url).pathname).replace(/^\/storage\/v1\/object\/public\//, ""), row]));
    await pool(files, 6, async file => {
      const key = archiveKey(file.bucket, file.path);
      try {
        const moved = movedAt.get(`${file.bucket}/${file.path}`);
        if (moved && (await sizeInR2(moved.key)) === Number(moved.bytes)) { alreadyMoved++; listed.push({ ...file, key: moved.key, sha256: moved.sha256 }); return; }
        const existing = await sizeInR2(key);
        if (existing != null && existing === file.size) { skipped++; listed.push({ ...file, key, sha256: "" }); return; }
        const bytes = await retry(async () => {
          const { data, error: downloadError } = await old.storage.from(file.bucket).download(file.path);
          if (downloadError) throw new Error(downloadError.message);
          return new Uint8Array(await data.arrayBuffer());
        });
        await putR2(key, bytes, file.mime, `${file.bucket}/${file.path}`);
        copiedFiles++;
        listed.push({ ...file, size: bytes.length, key, sha256: sha256(bytes) });
      } catch (archiveError) { failed.push(`${file.bucket}/${file.path}: ${archiveError.message}`); }
    });
    fs.writeFileSync(listFile, csvText(["bucket", "path", "size", "mime", "key", "sha256"], listed.sort((a, b) => a.key.localeCompare(b.key))));
    console.log(`  disalin ke R2 arsip/wellbeing-lama/: ${copiedFiles}, sudah ada: ${skipped}, foto bukti yang sudah pindah (tidak disimpan dua kali): ${alreadyMoved}, GAGAL: ${failed.length}; daftar: ${listFile}`);
    for (const line of failed) console.log(`    - ${line}`);
  }
}
if (problems.length) process.exitCode = 2;
