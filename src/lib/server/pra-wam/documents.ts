import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { matchesType, safeFilename, type DocumentStart, type PraWamDocument } from "@/lib/pra-wam/documents";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { listEvents } from "./events";
import type { Member } from "./session";
import { getSession, listSessions, sessionsWaiting } from "./sessions";

/*
 * Pra WAM documents in private R2 storage. A session's documents are for its participants (and
 * panitia, BOD, admin); documents without a session are for everyone. Panitia uploads anywhere;
 * a participant uploads to their own published session. Upload in two steps: the server agrees
 * a key, type and size (signed, so the second step cannot claim another file), the browser puts
 * the file, and the server checks it before listing it.
 */

const notReady = () => new ServiceError(503, "Penyimpanan dokumen belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_documents/.test(error.message ?? "");

function sign(key: string, input: DocumentStart, viewer: Member): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`dokumen\0${key}\0${input.size}\0${input.mime}\0${input.sessionId}\0${viewer.id}`).digest("hex");
}

async function requireUpload(viewer: Member, sessionId: string) {
  if (managesSessions(viewer)) return;
  if (!sessionId) throw new ServiceError(403, "Dokumen umum hanya bisa diunggah panitia. Unggah dari halaman sesi yang kamu ikuti.");
  const session = await getSession(sessionId, viewer);
  if (!session.isParticipant || session.status !== "terbit") throw new ServiceError(403, "Kamu hanya bisa mengunggah ke sesi yang kamu ikuti.");
}

/** Step one: where to put the file, valid ten minutes. */
export async function startUpload(input: DocumentStart, viewer: Member): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  await requireUpload(viewer, input.sessionId);
  const key = `pra-wam/dokumen/${randomUUID()}/${safeFilename(input.filename, input.mime)}`;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: sign(key, input, viewer) };
}

/** Step two: the file is there, has the agreed size, and is what it says; then it is listed. */
export async function finishUpload(input: DocumentStart & { key: string; token: string }, viewer: Member): Promise<void> {
  if (!isR2Configured()) throw notReady();
  const expected = Buffer.from(sign(input.key, input, viewer), "hex");
  if (!timingSafeEqual(Buffer.from(input.token, "hex"), expected)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  await requireUpload(viewer, input.sessionId);
  const start = await uploadedStart(input.key, input.size);
  if (!matchesType(input.mime, start)) {
    await removeObjects([input.key]).catch(() => undefined);
    throw new ServiceError(422, "Isi berkas tidak sesuai jenisnya. Unggah PDF, Word, Excel, PowerPoint, JPG, atau PNG yang asli.");
  }
  const { events } = await listEvents();
  const event = events.find(item => item.kind === "pra_wam");
  if (!event) throw new ServiceError(503, "Acara Pra WAM belum tersedia.");
  const { error } = await createPrivilegedClient().from("pw_documents").insert({
    event_id: event.id, session_id: input.sessionId || null, title: input.title, file_key: input.key,
    filename: input.key.split("/").pop(), mime: input.mime, size: input.size, uploaded_by: viewer.id,
  });
  if (error) {
    await removeObjects([input.key]).catch(() => undefined);
    if (missing(error)) throw sessionsWaiting();
    databaseError(error);
  }
}

type Row = { id: string; title: string; filename: string; mime: string; size: number; created_at: string; session_id: string | null; uploaded_by: string; file_key: string };

/** What the person may read: everyone's documents, plus those of the sessions they may see. */
export async function listDocuments(viewer: Member, sessionId?: string): Promise<{ documents: PraWamDocument[]; migrated: boolean; storage: boolean }> {
  const { sessions, migrated } = await listSessions(viewer);
  if (!migrated) return { documents: [], migrated: false, storage: isR2Configured() };
  const visible = sessions.filter(session => seesAllSessions(viewer) || (session.status === "terbit" && session.isParticipant));
  let query = createPrivilegedClient().from("pw_documents").select("id,title,filename,mime,size,created_at,session_id,uploaded_by,file_key");
  query = sessionId ? query.eq("session_id", sessionId) : visible.length ? query.or(`session_id.is.null,session_id.in.(${visible.map(session => session.id).join(",")})`) : query.is("session_id", null);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(300);
  if (error) { if (missing(error)) return { documents: [], migrated: false, storage: isR2Configured() }; databaseError(error); }
  const people = await listPeople();
  const rows = ((data ?? []) as Row[]).filter(row => !row.session_id || visible.some(session => session.id === row.session_id));
  return {
    migrated: true, storage: isR2Configured(),
    documents: rows.map(row => ({
      id: row.id, title: row.title, filename: row.filename, mime: row.mime, size: row.size, createdAt: row.created_at,
      sessionId: row.session_id, sessionTitle: sessions.find(session => session.id === row.session_id)?.title ?? null,
      uploadedBy: people.find(person => person.id === row.uploaded_by)?.name ?? "Tanpa nama",
      canDelete: row.uploaded_by === viewer.id || managesSessions(viewer),
    })),
  };
}

async function readable(id: string, viewer: Member): Promise<Row> {
  const { data, error } = await createPrivilegedClient().from("pw_documents").select("id,title,filename,mime,size,created_at,session_id,uploaded_by,file_key").eq("id", id).maybeSingle();
  if (error) { if (missing(error)) throw sessionsWaiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Dokumen tidak ditemukan.");
  if (data.session_id) await getSession(data.session_id, viewer); // 404 for anyone who may not see the session
  return data as Row;
}

/** A five-minute download address. */
export async function downloadUrl(id: string, viewer: Member): Promise<string> {
  if (!isR2Configured()) throw notReady();
  const row = await readable(id, viewer);
  return presignDownload(row.file_key, { seconds: 300, filename: row.filename });
}

export async function deleteDocument(id: string, viewer: Member): Promise<void> {
  const row = await readable(id, viewer);
  if (row.uploaded_by !== viewer.id && !managesSessions(viewer)) throw new ServiceError(403, "Hanya pengunggah atau panitia yang bisa menghapus dokumen ini.");
  const { error } = await createPrivilegedClient().from("pw_documents").delete().eq("id", id);
  if (error) databaseError(error);
  if (isR2Configured()) await removeObjects([row.file_key]).catch(() => undefined);
}
