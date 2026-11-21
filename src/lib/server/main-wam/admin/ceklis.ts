import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  checklistPhotoKey, isChecklistPhotoKey, type ChecklistInput, type ChecklistPhotoRef, type ChecklistPhotoStart, type SessionChecklist,
} from "@/lib/main-wam/ceklis/ceklis";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../../config";
import { isR2Configured, presignDownload, presignUpload, removeObjects, verifyUpload } from "../../r2";
import { itemFromRow, ITEM_COLUMNS, realChecklists } from "../ceklis/data";
import { adminFail, adminWaiting, db } from "./common";

/*
 * Admin WAM → Main WAM → Rundown → ceklis (agen S1; migration 202611250001): an agenda's checklist as
 * the admin edits it. The list replaces the old one in one save (items that keep their id keep their
 * ticks; a removed one takes its ticks with it), and the "wajib lengkap sebelum absen" switch is
 * saved with it. A photo goes up in two steps like the guides' files (the server names a fresh key
 * and signs its size and type, the browser puts the file, the server checks the first bytes); the
 * save then links it, and a photo no item uses any more is removed from storage.
 */

const refusals = { invalid: "Isian ceklis belum sesuai aturan. Periksa lagi lalu simpan." };

/** Every saved checklist, for the Rundown page (an agenda with neither items nor the switch has none). Null before the migration. */
export async function adminChecklists(): Promise<Map<string, SessionChecklist> | null> {
  const read = await realChecklists();
  return read.migrated ? read.data : null;
}

/** One agenda's saved checklist (empty when it has none). */
async function savedChecklist(sessionId: string): Promise<SessionChecklist> {
  const [{ data: items, error }, { data: flag, error: flagError }] = await Promise.all([
    db().from("mw_checklist_items").select(ITEM_COLUMNS).eq("session_id", sessionId).order("sort").order("created_at"),
    db().from("mw_sessions").select("checklist_required").eq("id", sessionId).maybeSingle(),
  ]);
  if (error) adminFail(error);
  if (flagError) adminFail(flagError);
  return { required: flag?.checklist_required === true, items: (items ?? []).map(row => itemFromRow(row as never)) };
}

/** Saves an agenda's whole checklist; answers with what is saved. */
export async function saveChecklist(sessionId: string, input: ChecklistInput): Promise<SessionChecklist> {
  const { data: session, error: sessionError } = await db().from("mw_sessions").select("id").eq("id", sessionId).maybeSingle();
  if (sessionError) adminFail(sessionError);
  if (!session) throw new ServiceError(404, "Sesi tidak ditemukan. Muat ulang halaman.");
  const before = await savedChecklist(sessionId);
  const known = new Map(before.items.map(item => [item.id, item]));
  const unknown = input.items.find(item => item.id && !known.has(item.id));
  if (unknown) throw new ServiceError(409, "Ada item yang sudah dihapus orang lain. Tutup lalu buka lagi untuk melihat yang terbaru.");

  // A photo key is used by one item only (a new key is a fresh upload; the old key stays with its item).
  const keys = input.items.map(item => item.photo?.key).filter((key): key is string => !!key);
  if (new Set(keys).size !== keys.length) throw new ServiceError(422, "Satu foto hanya boleh dipakai satu item.");
  const fresh = keys.filter(key => !before.items.some(item => item.photo?.key === key));
  if (fresh.length) {
    const { data: taken, error } = await db().from("mw_checklist_items").select("id").in("photo_key", fresh).limit(1);
    if (error) adminFail(error);
    if (taken?.length) throw new ServiceError(422, "Foto ini sudah dipakai item lain. Unggah ulang fotonya.");
  }

  const now = new Date().toISOString();
  const rows = input.items.map((item, index) => ({
    id: item.id ?? randomUUID(), session_id: sessionId, text: item.text, note: item.note, sort: index, updated_at: now,
    photo_key: item.photo?.key ?? null, photo_mime: item.photo?.mime ?? null, photo_size: item.photo?.size ?? null,
  }));
  const keepIds = new Set(rows.map(row => row.id));
  const removed = before.items.filter(item => !keepIds.has(item.id));
  if (removed.length) {
    const { error } = await db().from("mw_checklist_items").delete().in("id", removed.map(item => item.id));
    if (error) adminFail(error, refusals);
  }
  if (rows.length) {
    const { error } = await db().from("mw_checklist_items").upsert(rows, { onConflict: "id" });
    if (error) adminFail(error, refusals);
  }
  // The switch rides with the list; touching updated_at is left to the row's own trigger (a checklist edit is not a schedule change).
  const { error: flagError } = await db().from("mw_sessions").update({ checklist_required: input.required }).eq("id", sessionId);
  if (flagError) adminFail(flagError, refusals);

  // Storage: the photos nobody uses any more (removed items, replaced photos).
  const still = new Set(keys);
  const orphans = before.items.map(item => item.photo?.key).filter((key): key is string => !!key && !still.has(key));
  if (orphans.length && isR2Configured()) await removeObjects(orphans).catch(() => undefined);
  return savedChecklist(sessionId);
}

/* ── Photos ───────────────────────────────────────────────────────────────────────────────────── */

const TOKEN_SECONDS = 15 * 60;
const notReady = () => new ServiceError(503, "Foto belum bisa diunggah karena penyimpanan berkas belum disiapkan. Hubungi tim CoE.");

function signature(key: string, input: ChecklistPhotoStart, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Unggahan berkas belum bisa dipakai. Hubungi tim CoE.");
  return createHmac("sha256", secret).update(`mw-ceklis\0${key}\0${input.size}\0${input.mime}\0${expires}`).digest("hex");
}
export function checklistTokenMatches(token: string, key: string, input: ChecklistPhotoStart, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  try { return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, expires), "hex")); } catch { return false; }
}

/** Step one: a fresh key, an upload address, and a token for step two. */
export async function startChecklistPhoto(input: ChecklistPhotoStart): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  const key = checklistPhotoKey(randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${signature(key, input, expires)}` };
}

/** Step two: the file is there and is the image it says; the key is then good for a save. */
export async function confirmChecklistPhoto(input: ChecklistPhotoStart & { key: string; token: string }): Promise<ChecklistPhotoRef> {
  if (!isR2Configured()) throw notReady();
  if (!isChecklistPhotoKey(input.key) || !checklistTokenMatches(input.token, input.key, input)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  try {
    const kind = await verifyUpload(input.key, input.size, ["webp", "png", "jpeg"]);
    const expected = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpeg" }[input.mime];
    if (kind !== expected) throw new ServiceError(422, "Isi gambar tidak sesuai jenisnya. Unggah ulang gambarnya.");
  } catch (error) { await discard(); throw error; }
  return { key: input.key, mime: input.mime, size: input.size };
}

/** An item's photo key for the admin to open (any agenda, draft too). */
export async function adminItemPhotoUrl(itemId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const { data, error } = await db().from("mw_checklist_items").select("photo_key").eq("id", itemId).maybeSingle();
  if (error) { if (error.code === "42P01" || error.code === "PGRST205") throw adminWaiting(); adminFail(error); }
  return data?.photo_key && isR2Configured() ? presignDownload(data.photo_key as string, { seconds: 300 }).catch(() => null) : null;
}
