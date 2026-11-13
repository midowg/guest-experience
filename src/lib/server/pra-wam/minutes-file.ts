import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { minutesApi } from "@/lib/pra-wam/minutes";
import {
  isMeetingFileKey, looksLike, MOM_FILE_MIGRATION, MOM_FILE_TYPES, momFileExt, momFileKeyFor, momFileName,
  type MinuteFile, type MomFileStart, type MomFileType,
} from "@/lib/pra-wam/minutes-file";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, readObject, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { mayWriteMinutes, requireWriter, sent } from "./minutes-photos";
import type { Member } from "./session";
import { getSession } from "./sessions";

/*
 * MoM sebagai berkas (13 Nov 2026, migration 202611130004): one PDF or Word file per meeting, in
 * private R2 storage under pra-wam/mom/<session>/berkas/. Uploaded in two steps like the photos
 * (the server agrees a key and size, signed for a short while; the browser puts the file; the
 * server checks its size and first bytes before keeping it). A new upload replaces the earlier one.
 */

const TOKEN_SECONDS = 15 * 60;
type FileRow = { session_id: string; file_key: string; name: string; size: number; content_type: MomFileType; uploaded_by: string | null; uploaded_at: string };
const COLUMNS = "session_id,file_key,name,size,content_type,uploaded_by,uploaded_at";

export const filesMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_session_minute_files/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Unggah berkas MoM menunggu migrasi ${MOM_FILE_MIGRATION}.`);
const notReady = () => new ServiceError(503, "Penyimpanan berkas belum disiapkan.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");

/** The meeting's file row; null when none, or before the migration. */
export async function minuteFileRow(sessionId: string): Promise<FileRow | null> {
  const { data, error } = await createPrivilegedClient().from("pw_session_minute_files").select(COLUMNS).eq("session_id", sessionId).maybeSingle();
  if (error) { if (filesMissing(error)) return null; databaseError(error); }
  return (data as FileRow | null) ?? null;
}
/** Whether a file can be uploaded at all: the migration ran and storage is set up. */
export async function filesReady(): Promise<boolean> {
  if (!isR2Configured()) return false;
  const { error } = await createPrivilegedClient().from("pw_session_minute_files").select("session_id").limit(1);
  return !error;
}

/** The meeting's MoM file for Detail sesi (null when none). */
export async function minuteFileOf(sessionId: string, write: boolean): Promise<MinuteFile | null> {
  const row = await minuteFileRow(sessionId);
  if (!row) return null;
  const by = row.uploaded_by ? (await listPeople()).find(person => person.id === row.uploaded_by)?.name ?? "Tanpa nama" : null;
  return { name: row.name, size: row.size, type: row.content_type, uploadedBy: by, uploadedAt: row.uploaded_at, url: minutesApi.file(sessionId), canDelete: write };
}

function signature(key: string, input: MomFileStart, sessionId: string, member: Member, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`mom-berkas\0${key}\0${input.size}\0${momFileName(input.name)}\0${sessionId}\0${member.id}\0${expires}`).digest("hex");
}
function tokenMatches(token: string, key: string, input: MomFileStart, sessionId: string, member: Member, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, sessionId, member, expires), "hex"));
}

/** Step one: where to put the file, and a token to confirm it with. */
export async function startMinuteFile(sessionId: string, input: MomFileStart, member: Member): Promise<{ key: string; uploadUrl: string; token: string; type: MomFileType }> {
  if (!isR2Configured()) throw notReady();
  const session = await getSession(sessionId, member);
  await requireWriter(session, member);
  if (!(await filesReady())) throw waiting();
  const ext = momFileExt(input.name)!;
  const type = MOM_FILE_TYPES[ext];
  const key = momFileKeyFor(sessionId, randomUUID(), ext);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, type, uploadUrl: await presignUpload(key, type, input.size), token: `${expires}.${signature(key, input, sessionId, member, expires)}` };
}

/** Step two: the file is there with the agreed size and is what it says; it replaces an earlier one. */
export async function confirmMinuteFile(sessionId: string, input: MomFileStart & { key: string; token: string }, member: Member): Promise<MinuteFile> {
  if (!isR2Configured()) throw notReady();
  if (!isMeetingFileKey(input.key, sessionId) || !tokenMatches(input.token, input.key, input, sessionId, member)) throw unknownUpload();
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  const session = await getSession(sessionId, member);
  try { await requireWriter(session, member); } catch (error) { await discard(); throw error; }
  const type = MOM_FILE_TYPES[momFileExt(input.key)!];
  let start: Uint8Array;
  try { start = await uploadedStart(input.key, input.size); } catch (error) { await discard(); throw error; }
  if (!looksLike(type, start)) { await discard(); throw new ServiceError(422, "Isi berkas tidak sesuai jenisnya. Pilih berkas PDF atau Word yang benar."); }
  const before = await minuteFileRow(sessionId);
  if (before?.file_key === input.key) return (await minuteFileOf(sessionId, true))!; // confirmed twice: kept already
  const { error } = await createPrivilegedClient().from("pw_session_minute_files").upsert({
    session_id: sessionId, file_key: input.key, name: momFileName(input.name), size: input.size, content_type: type, uploaded_by: member.id, uploaded_at: new Date().toISOString(),
  }, { onConflict: "session_id" });
  if (error) { await discard(); if (filesMissing(error)) throw waiting(); databaseError(error); }
  // The earlier file goes once the new one is kept.
  if (before) await removeObjects([before.file_key]).catch(() => undefined);
  return (await minuteFileOf(sessionId, true))!;
}

export async function deleteMinuteFile(sessionId: string, member: Member): Promise<void> {
  const session = await getSession(sessionId, member);
  await requireWriter(session, member);
  const row = await minuteFileRow(sessionId);
  if (!row) return;
  const { error } = await createPrivilegedClient().from("pw_session_minute_files").delete().eq("session_id", sessionId);
  if (error) databaseError(error);
  if (isR2Configured()) await removeObjects([row.file_key]).catch(() => undefined);
}

/** A short-lived download address, for whoever may read the MoM (a draft's: its writers). */
export async function minuteFileUrl(sessionId: string, member: Member): Promise<string> {
  if (!isR2Configured()) throw new ServiceError(404, "Berkas tidak ditemukan.");
  const session = await getSession(sessionId, member);
  if (!mayWriteMinutes(session, member) && !(await sent(sessionId))) throw new ServiceError(404, "Berkas tidak ditemukan.");
  return minuteFileAddress(sessionId);
}
/** The download address without a member's check (Arsip MoM, for admins). */
export async function minuteFileAddress(sessionId: string): Promise<string> {
  const row = await minuteFileRow(sessionId);
  if (!row) throw new ServiceError(404, "Berkas tidak ditemukan.");
  return presignDownload(row.file_key, { seconds: 600, filename: row.name });
}

/** The file's bytes, name and type, for Telegram; null when none. */
export async function minuteFileBytes(sessionId: string): Promise<{ bytes: Uint8Array; name: string; type: MomFileType } | null> {
  if (!isR2Configured()) return null;
  const row = await minuteFileRow(sessionId);
  if (!row) return null;
  const object = await readObject(row.file_key);
  return object ? { bytes: object.bytes, name: row.name, type: row.content_type } : null;
}
