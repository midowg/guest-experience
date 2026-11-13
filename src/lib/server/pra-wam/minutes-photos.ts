import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { MinutePhoto } from "@/lib/pra-wam/minutes";
import { minutesApi, minutesClosed, minutesOpen } from "@/lib/pra-wam/minutes";
import { isJpeg, isMeetingPhotoKey, MOM_PHOTO_MIGRATION, MOM_PHOTOS_MAX, momPhotoKeyFor, momPhotoRule, photoLimitLabel, type MomPhotoStart } from "@/lib/pra-wam/minutes-photos";
import { managesSessions } from "@/lib/pra-wam/roles";
import type { Session } from "@/lib/pra-wam/sessions";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, readObject, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import type { Member } from "./session";
import { getSession } from "./sessions";

/*
 * Foto meeting di MoM (12 Nov 2026, migration 202611120005), in private R2 storage under
 * pra-wam/mom/<session>/. Whoever may write the MoM adds and removes them once the meeting has
 * started; whoever may read the MoM sees them (a draft's only those who may write it). Upload in
 * two steps, as profile photos: the server agrees a key and size (signed, valid a short while),
 * the browser puts the JPEG, the server checks it before keeping it. They go into the MoM's PDF.
 */

const TOKEN_SECONDS = 15 * 60;
/** The storage address a photo's route redirects to: longer than the hour the redirect is cached. */
const VIEW_SECONDS = 75 * 60;

type PhotoRow = { id: string; session_id: string; file_key: string; size: number; width: number | null; height: number | null; uploaded_by: string | null; created_at: string };
const COLUMNS = "id,session_id,file_key,size,width,height,uploaded_by,created_at";

export const photosMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_session_minute_photos/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Foto MoM menunggu migrasi ${MOM_PHOTO_MIGRATION}.`);
const notReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");

/** Anyone in the meeting, or panitia/admin, may write its MoM. */
export const mayWriteMinutes = (session: Session, member: Member) => session.isParticipant || managesSessions(member);

/** Adds or removes photos: may write the MoM, and the meeting has started. */
function requireWriter(session: Session, member: Member) {
  if (!mayWriteMinutes(session, member)) throw new ServiceError(403, "Hanya yang ikut meeting ini yang bisa menambah fotonya.");
  if (minutesClosed(session, new Date())) throw new ServiceError(409, "Batas mengisi atau merevisi MoM sudah lewat (1 x 24 jam setelah meeting selesai).");
  if (!minutesOpen(session, new Date())) throw new ServiceError(409, "Foto bisa ditambah setelah meeting dimulai.");
}

async function rows(sessionId: string): Promise<PhotoRow[]> {
  const { data, error } = await createPrivilegedClient().from("pw_session_minute_photos").select(COLUMNS).eq("session_id", sessionId).order("created_at");
  if (error) { if (photosMissing(error)) throw waiting(); databaseError(error); }
  return (data ?? []) as PhotoRow[];
}

/** Whether a reader who may not write sees the MoM: only once it is sent. */
async function sent(sessionId: string): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().from("pw_session_minutes").select("sent_at").eq("session_id", sessionId).maybeSingle();
  if (error) return false;
  return !!(data as { sent_at?: string | null } | null)?.sent_at;
}

/** The meeting's photos for Detail sesi (empty before the migration). */
export async function listMinutePhotos(sessionId: string, write: boolean): Promise<MinutePhoto[]> {
  const found = await rows(sessionId).catch(error => { if (error instanceof ServiceError && error.status === 503) return [] as PhotoRow[]; throw error; });
  if (!found.length) return [];
  const names = new Map((await listPeople()).map(person => [person.id, person.name]));
  return found.map(row => ({
    id: row.id, url: minutesApi.photo(sessionId, row.id), width: row.width, height: row.height,
    uploadedBy: row.uploaded_by ? names.get(row.uploaded_by) ?? "Tanpa nama" : null, canDelete: write,
  }));
}

function signature(key: string, input: MomPhotoStart, sessionId: string, member: Member, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`mom-foto\0${key}\0${input.size}\0${input.width}\0${input.height}\0${sessionId}\0${member.id}\0${expires}`).digest("hex");
}

export function momTokenMatches(token: string, key: string, input: MomPhotoStart, sessionId: string, member: Member, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, sessionId, member, expires), "hex"));
}

/**
 * Whether Full HD photos (1920 px, 1 MB) may be kept: migration 202611120006 ran. Its column on
 * pw_tv_slides tells; before it the photo table still allows 400 KB.
 */
export async function photosHd(): Promise<boolean> {
  const { error } = await createPrivilegedClient().from("pw_tv_slides").select("mom_photo_id").limit(1);
  return !error;
}

/** Step one: where to put the photo, and a token to confirm it with. */
export async function startMinutePhoto(sessionId: string, input: MomPhotoStart, member: Member): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  const session = await getSession(sessionId, member);
  requireWriter(session, member);
  if ((await rows(sessionId)).length >= MOM_PHOTOS_MAX) throw new ServiceError(409, `Paling banyak ${MOM_PHOTOS_MAX} foto per meeting. Hapus satu dulu.`);
  const rule = momPhotoRule(await photosHd());
  if (input.size > rule.bytes) throw new ServiceError(413, `Foto lebih dari ${photoLimitLabel(rule.bytes)}. Muat ulang halaman, lalu unggah lagi.`);
  const key = momPhotoKeyFor(sessionId, randomUUID());
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, "image/jpeg", input.size), token: `${expires}.${signature(key, input, sessionId, member, expires)}` };
}

/** Step two: the photo is there with the agreed size and is a JPEG; then it is kept. */
export async function confirmMinutePhoto(sessionId: string, input: MomPhotoStart & { key: string; token: string }, member: Member): Promise<MinutePhoto[]> {
  if (!isR2Configured()) throw notReady();
  if (!isMeetingPhotoKey(input.key, sessionId) || !momTokenMatches(input.token, input.key, input, sessionId, member)) throw unknownUpload();
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  const session = await getSession(sessionId, member);
  try { requireWriter(session, member); } catch (error) { await discard(); throw error; }
  let start: Uint8Array;
  try { start = await uploadedStart(input.key, input.size); } catch (error) { await discard(); throw error; }
  if (!isJpeg(start)) { await discard(); throw new ServiceError(422, "Isi berkas bukan foto JPEG. Pilih foto lain."); }
  const { error } = await createPrivilegedClient().from("pw_session_minute_photos").insert({
    session_id: sessionId, file_key: input.key, size: input.size, width: input.width, height: input.height, uploaded_by: member.id,
  });
  // The same upload confirmed twice (a double tap, a retry): it is kept already, so its file stays.
  if (error && !(error.code === "23505" && /file_key/.test(error.message ?? ""))) { await discard(); if (photosMissing(error)) throw waiting(); databaseError(error); }
  return listMinutePhotos(sessionId, true);
}

async function photoRow(sessionId: string, photoId: string): Promise<PhotoRow> {
  const { data, error } = await createPrivilegedClient().from("pw_session_minute_photos").select(COLUMNS).eq("id", photoId).eq("session_id", sessionId).maybeSingle();
  if (error) { if (photosMissing(error)) throw new ServiceError(404, "Foto tidak ditemukan."); databaseError(error); }
  if (!data) throw new ServiceError(404, "Foto tidak ditemukan.");
  return data as PhotoRow;
}

export async function deleteMinutePhoto(sessionId: string, photoId: string, member: Member): Promise<MinutePhoto[]> {
  const session = await getSession(sessionId, member);
  requireWriter(session, member);
  const row = await photoRow(sessionId, photoId);
  const { error } = await createPrivilegedClient().from("pw_session_minute_photos").delete().eq("id", row.id);
  if (error) databaseError(error);
  if (isR2Configured()) await removeObjects([row.file_key]).catch(() => undefined);
  return listMinutePhotos(sessionId, true);
}

/** A short-lived storage address of a photo, for whoever may read the MoM (a draft's: its writers). */
export async function minutePhotoUrl(sessionId: string, photoId: string, member: Member): Promise<string> {
  if (!isR2Configured()) throw new ServiceError(404, "Foto tidak ditemukan.");
  const session = await getSession(sessionId, member); // 404 for anyone who may not open the meeting
  if (!mayWriteMinutes(session, member) && !(await sent(sessionId))) throw new ServiceError(404, "Foto tidak ditemukan.");
  const row = await photoRow(sessionId, photoId);
  return presignDownload(row.file_key, { seconds: VIEW_SECONDS });
}

/**
 * A photo's copy for the PDF: at most 1280 px, JPEG 0.8. Ten Full HD photos would make the PDF too
 * heavy to download from the server and to open on a phone. When the server cannot make it
 * smaller, the photo goes as it is.
 */
export async function pdfCopy(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(Buffer.from(bytes)).resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return out.length < bytes.length ? new Uint8Array(out) : bytes;
  } catch {
    return bytes;
  }
}

/** The photos for the PDF, in order, each made small (`pdfCopy`); one that cannot be read is left out. */
export async function minutePhotoBytes(sessionId: string): Promise<Uint8Array[]> {
  if (!isR2Configured()) return [];
  const found = await rows(sessionId).catch(() => [] as PhotoRow[]);
  const read = await Promise.all(found.map(row => readObject(row.file_key).catch(() => null)));
  const photos = read.filter((object): object is { bytes: Uint8Array; type: string } => !!object && isJpeg(object.bytes)).map(object => object.bytes);
  return Promise.all(photos.map(pdfCopy));
}
