import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { rateLimitSecret, ServiceError } from "./config";
import { createPrivilegedClient } from "./supabase/admin";

export function success<T>(data: T, message = "Data tersimpan.") {
  return NextResponse.json({ ok: true, data, message }, { headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  const known = error instanceof ServiceError;
  return NextResponse.json({ ok: false, message: known ? error.message : "Layanan belum dapat memproses permintaan. Coba kembali nanti.", ...(known && error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) }, {
    status: known ? error.status : 503, headers: { "Cache-Control": "no-store", ...(known && error.status === 429 ? { "Retry-After": "600" } : {}) },
  });
}
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (error) { return failure(error); }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ServiceError(403, "Permintaan harus berasal dari situs acara ini.");
  }
}
export async function readJson(request: Request, maxBytes = 200_000): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ServiceError(415, "Gunakan payload JSON.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ServiceError(413, "Isi formulir terlalu besar.");
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError(400, "Isi formulir tidak tersedia.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ServiceError(413, "Isi formulir terlalu besar."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ServiceError(400, "JSON tidak valid."); }
}
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) (fields[issue.path.join(".") || "form"] ??= []).push(issue.message);
    throw new ServiceError(422, "Periksa kembali isian formulir.", fields);
  }
  return result.data;
}
export function databaseError(error: { message: string; code?: string }): never {
  const messages: Record<string, [number, string]> = {
    EVENT_CLOSED: [409, "Formulir acara tidak menerima jawaban saat ini."],
    NOT_FOUND: [404, "Acara tidak ditemukan."],
    FORBIDDEN: [403, "Akses admin diperlukan. Muat ulang halaman ini, atau masuk kembali ke panel admin sebelum menyimpan."],
    IDEMPOTENCY_CONFLICT: [409, "Kunci pengiriman sudah digunakan untuk isian berbeda. Muat ulang formulir."],
    QUESTIONS_LOCKED: [409, "Pertanyaan yang telah menerima jawaban tidak dapat diubah. Duplikasikan acara untuk survei baru."],
    EVENT_IS_FEATURED: [409, "Acara ini sedang tayang di halaman utama. Hentikan tayangnya terlebih dahulu, lalu hapus."],
    INVALID_ANSWERS: [422, "Jawaban tidak sesuai pertanyaan aktif. Muat ulang halaman."],
    INVALID_EVENT: [422, "Konten acara tidak valid."],
    INVALID_INVITATION: [422, "Data undangan tamu tidak valid."],
    INVITATION_LIMIT: [409, "Batas 1000 undangan per acara tercapai."],
    EVENT_NOT_FOUND: [404, "Acara tidak ditemukan."],
    BEO_CHANGED: [409, "BEO baru saja diubah orang lain. Muat ulang halaman untuk melihat angka terbaru."],
    BEO_STEP: [409, "Langkah ini tidak tersedia untuk status BEO sekarang. Muat ulang halaman."],
    BEO_REASON: [422, "Tulis alasan revisi agar perubahan angka tercatat."],
    TICKET_UNKNOWN: [404, "Tiket tidak dikenal untuk acara ini. Pastikan QR berasal dari undangan acara ini."],
    TICKET_NOT_ATTENDING: [409, "Tamu ini tidak terdaftar hadir, jadi tidak punya tiket."],
  };
  if (messages[error.message]) { const [status, message] = messages[error.message]; throw new ServiceError(status, message); }
  if (error.code === "23505") throw new ServiceError(409, "Slug atau ID sudah digunakan. Gunakan nilai berbeda.");
  throw new ServiceError(503, "Database belum dapat memproses permintaan. Periksa koneksi dan migrasi Supabase.");
}
export async function enforceRateLimit(request: Request, scope: string, limit: number) {
  const secret = rateLimitSecret();
  // Vercel overwrites this header. Do not trust arbitrary forwarded-for headers off Vercel.
  const candidate = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() : undefined;
  const identity = candidate && isIP(candidate) ? candidate : "shared-untrusted-network";
  const key = createHmac("sha256", secret).update(`${scope}\0${identity}`).digest("hex");
  const { data, error } = await createPrivilegedClient().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 600 });
  if (error) databaseError(error);
  if (!data) throw new ServiceError(429, "Terlalu banyak permintaan. Tunggu sepuluh menit sebelum mencoba kembali.");
}
