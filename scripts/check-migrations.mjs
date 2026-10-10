// Development-only: confirm the applied migrations really took effect, using the app's own
// credentials. Reads structure and counts; never prints keys or guest personal data.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !anon || !secret) { console.log("Environment belum lengkap."); process.exit(2); }

const admin = createClient(url, secret, { auth: { persistSession: false } });
const guest = createClient(url, anon, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ pemeriksaan: name, hasil: ok ? "OK" : "GAGAL", catatan: detail });

// 1. Featured-event settings row.
{
  const { data, error } = await admin.from("site_settings").select("id, featured_event_id").maybeSingle();
  check("Tabel site_settings ada", !error, error?.message ?? (data ? `acara tayang: ${data.featured_event_id ?? "belum dipilih"}` : "baris kosong"));
}

// 2. Featured view.
{
  const { error } = await admin.from("featured_event").select("id").limit(1);
  check("View featured_event ada", !error, error?.message ?? "");
}

// 3. Storage bucket and its limits.
{
  const { data, error } = await admin.storage.getBucket("event-photos");
  // The API returns snake_case; reading only camelCase reported a real limit as missing.
  const limit = data?.file_size_limit ?? data?.fileSizeLimit ?? null;
  const types = (data?.allowed_mime_types ?? data?.allowedMimeTypes ?? []).join(", ");
  check("Bucket event-photos ada", !error && !!data, error?.message ?? `publik: ${data?.public}`);
  check("Batas ukuran terpasang", limit === 8388608, limit ? `${(limit / 1024 / 1024).toFixed(0)} MB` : "tidak ada batas");
  check("Tipe berkas dibatasi", types.includes("image/"), types || "tidak ada pembatasan tipe");
}

// 4. Every event document carries the new fields, so the editor cannot hit a missing value.
{
  const { data, error } = await admin.from("event_documents").select("slug, document");
  if (error) check("Dokumen acara terbaca", false, error.message);
  else {
    const missingHero = data.filter(row => !row.document?.hero);
    const missingGallery = data.filter(row => !Array.isArray(row.document?.gallery));
    const missingSrcset = data.filter(row => (row.document?.gallery ?? []).some(item => !Array.isArray(item?.srcset)));
    check("Semua acara punya kolom hero", missingHero.length === 0, missingHero.length ? `kurang pada: ${missingHero.map(r => r.slug).join(", ")}` : `${data.length} acara diperiksa`);
    check("Semua acara punya galeri", missingGallery.length === 0, missingGallery.length ? `kurang pada: ${missingGallery.map(r => r.slug).join(", ")}` : "");
    check("Foto galeri punya daftar ukuran", missingSrcset.length === 0, missingSrcset.length ? `kurang pada: ${missingSrcset.map(r => r.slug).join(", ")}` : "");
    for (const row of data) {
      const hero = row.document?.hero;
      if (hero) check(`Nilai hero sah (${row.slug})`, ["top", "center", "bottom"].includes(hero.focus) && ["bottom-left", "bottom-center", "center-left", "center-center"].includes(hero.text_position), `fokus: ${hero.focus}, posisi: ${hero.text_position}`);
    }
  }
}

// 5. The guard that matters most: an anonymous visitor must not read guest answers.
{
  const { data, error } = await guest.from("rsvps").select("id").limit(1);
  check("Tamu anonim tidak bisa baca RSVP", !!error || (data?.length ?? 0) === 0, error ? "ditolak" : "mengembalikan 0 baris");
}
{
  const { error } = await guest.from("site_settings").select("featured_event_id").limit(1);
  check("Tamu anonim boleh baca acara tayang", !error, error?.message ?? "");
}

console.table(results);
const failed = results.filter(r => r.hasil === "GAGAL");
console.log(failed.length ? `${failed.length} pemeriksaan GAGAL` : "Semua pemeriksaan lolos.");
process.exit(0);
