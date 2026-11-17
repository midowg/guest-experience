import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { guideFileKey, guideSlug, isGuideFileKey, type GuideFileStart, type GuideInput } from "@/lib/main-wam/admin/guides";
import { GUIDE_COLUMNS, guideFromRow } from "@/lib/main-wam/rows";
import type { MwGuide } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { isSupabaseConfigured, ServiceError } from "../../config";
import { isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart, verifyUpload } from "../../r2";
import { mwMissing } from "../errors";
import { adminFail, adminWaiting, db } from "./common";

/*
 * Admin WAM → Main WAM → Panduan (agen E): the guides (drafts too), and their file (an image or a
 * PDF) in private storage under main-wam/panduan/. Upload in two steps like the KV images: the
 * server names a fresh key and signs its size and type, the browser puts the file, the server
 * checks the first bytes and only then links it (the old file is removed). Participants open it
 * through agen A's guideFile route; the admin sees a short-lived address.
 */

export type GuideBoard = { guides: MwGuide[]; migrated: boolean; storage: boolean; links: Record<string, string> };

/** Short-lived addresses of the guides' files, for the admin to open (one hour). */
async function fileLinks(rows: { id: string; file_key: string | null }[]): Promise<Record<string, string>> {
  if (!isR2Configured()) return {};
  const entries = await Promise.all(rows.filter(row => row.file_key).map(async row => [row.id, await presignDownload(row.file_key!, { seconds: 3600 }).catch(() => "")] as const));
  return Object.fromEntries(entries.filter(([, url]) => url));
}

export async function adminGuides(): Promise<GuideBoard> {
  if (!isSupabaseConfigured()) return { guides: [], migrated: false, storage: isR2Configured(), links: {} };
  const { data, error } = await db().from("mw_guides").select(GUIDE_COLUMNS).order("sort").order("title").limit(100);
  if (error) { if (mwMissing(error)) return { guides: [], migrated: false, storage: isR2Configured(), links: {} }; adminFail(error); }
  const rows = (data ?? []) as { id: string; file_key: string | null }[];
  return { guides: rows.map(row => guideFromRow(row as unknown as Record<string, unknown>)), migrated: true, storage: isR2Configured(), links: await fileLinks(rows) };
}
async function boardOrWait(): Promise<GuideBoard> {
  const board = await adminGuides();
  if (!board.migrated) throw adminWaiting();
  return board;
}

const refusals = { duplicate: "Alamat panduan ini sudah dipakai. Ubah judulnya sedikit.", invalid: "Judul 2–100 karakter dan isi paling panjang 8.000 karakter." };

export async function createGuide(input: GuideInput): Promise<GuideBoard & { id: string }> {
  const { data: taken, error: takenError } = await db().from("mw_guides").select("slug").limit(200);
  if (takenError) adminFail(takenError);
  const slug = guideSlug(input.title, (taken ?? []).map(row => row.slug as string));
  const { data, error } = await db().from("mw_guides").insert({ slug, kind: input.kind, title: input.title, body: input.body, sort: input.sort, published: input.published }).select("id").single();
  if (error) adminFail(error, refusals);
  return { ...(await boardOrWait()), id: data.id as string };
}

async function currentFile(id: string): Promise<{ file_key: string | null } | null> {
  const { data, error } = await db().from("mw_guides").select("file_key").eq("id", id).maybeSingle();
  if (error) adminFail(error);
  return data as { file_key: string | null } | null;
}

/** The guide's fields (its address stays, so links already shared keep working); `removeFile` drops its file. */
export async function updateGuide(id: string, input: GuideInput, removeFile = false): Promise<GuideBoard> {
  const before = await currentFile(id);
  if (!before) throw new ServiceError(404, "Panduan tidak ditemukan. Muat ulang halaman.");
  const { error } = await db().from("mw_guides").update({
    kind: input.kind, title: input.title, body: input.body, sort: input.sort, published: input.published, updated_at: new Date().toISOString(),
    ...(removeFile ? { file_key: null, file_mime: null, file_size: null } : {}),
  }).eq("id", id);
  if (error) adminFail(error, refusals);
  if (removeFile && before.file_key && isR2Configured()) await removeObjects([before.file_key]).catch(() => undefined);
  return boardOrWait();
}

/** Deletes the guide and its file; a session's Denah button that pointed here goes away. */
export async function deleteGuide(id: string): Promise<GuideBoard> {
  const before = await currentFile(id);
  if (!before) throw new ServiceError(404, "Panduan tidak ditemukan. Muat ulang halaman.");
  const { error } = await db().from("mw_guides").delete().eq("id", id);
  if (error) adminFail(error);
  if (before.file_key && isR2Configured()) await removeObjects([before.file_key]).catch(() => undefined);
  return boardOrWait();
}

/* ── Berkas ───────────────────────────────────────────────────────────────────────────────────── */

const TOKEN_SECONDS = 15 * 60;
const notReady = () => new ServiceError(503, "Gambar dan PDF belum bisa diunggah karena penyimpanan berkas belum disiapkan. Hubungi tim CoE.");

function signature(key: string, input: GuideFileStart, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Unggahan berkas belum bisa dipakai. Hubungi tim CoE.");
  return createHmac("sha256", secret).update(`mw-panduan\0${input.guideId}\0${key}\0${input.size}\0${input.mime}\0${expires}`).digest("hex");
}
export function guideTokenMatches(token: string, key: string, input: GuideFileStart, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  try { return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, expires), "hex")); } catch { return false; }
}

/** Step one: a fresh key for the guide's file, an upload address, and a token for step two. */
export async function startGuideFile(input: GuideFileStart): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  if (!(await currentFile(input.guideId))) throw new ServiceError(404, "Panduan tidak ditemukan. Simpan panduannya dulu.");
  const key = guideFileKey(randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${signature(key, input, expires)}` };
}

/** The first bytes are a PDF ("%PDF-") or an image of the agreed kind. */
async function checkBytes(key: string, input: GuideFileStart): Promise<void> {
  if (input.mime === "application/pdf") {
    const start = await uploadedStart(key, input.size);
    if (String.fromCharCode(...start.slice(0, 5)) !== "%PDF-") throw new ServiceError(422, "Berkas ini bukan PDF. Unggah PDF yang asli.");
    return;
  }
  const kind = await verifyUpload(key, input.size, ["webp", "png", "jpeg"]);
  const expected = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpeg" }[input.mime];
  if (kind !== expected) throw new ServiceError(422, "Isi gambar tidak sesuai jenisnya. Unggah ulang gambarnya.");
}

/** Step two: the file is there and is what it says; the guide links it, its old file is removed. */
export async function confirmGuideFile(input: GuideFileStart & { key: string; token: string }): Promise<GuideBoard> {
  if (!isR2Configured()) throw notReady();
  if (!isGuideFileKey(input.key) || !guideTokenMatches(input.token, input.key, input)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  try { await checkBytes(input.key, input); } catch (error) { await discard(); throw error; }
  const before = await currentFile(input.guideId);
  if (!before) { await discard(); throw new ServiceError(404, "Panduan tidak ditemukan. Muat ulang halaman."); }
  const { error } = await db().from("mw_guides").update({ file_key: input.key, file_mime: input.mime, file_size: input.size, updated_at: new Date().toISOString() }).eq("id", input.guideId);
  if (error) { await discard(); adminFail(error); }
  if (before.file_key && before.file_key !== input.key) await removeObjects([before.file_key]).catch(() => undefined);
  return boardOrWait();
}
