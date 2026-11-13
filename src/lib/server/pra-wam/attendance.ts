import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import {
  asMethod, checkInWindow, isOwnProofKey, newQrToken, proofKeyFor, SELF_CHECK_IN_MIGRATION, selfCheckInRefusal, windowState,
  type AttendanceRow, type CheckInResult, type Proof, type ProofStart, type SelfCheckIn, type SelfCheckInAnswer,
} from "@/lib/pra-wam/attendance";
import { photoMagicMatches } from "@/lib/pra-wam/photo";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import type { Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import type { Member } from "./session";
import { withBookingLink } from "./booking-sessions";
import { getSession } from "./sessions";

/*
 * Attendance (migration 202611040005). Scanning a session's printed QR signs the person in while
 * the window is open; panitia can correct by hand. One row per person per session, so a second
 * scan only answers "sudah tercatat". "Saya hadir" (migration 202611050003) signs the person in
 * from Detail sesi in the same window: at the office with one tap, or online with a screenshot of
 * the Zoom meeting in private R2 storage under pra-wam/absen/<session>/<employee>/.
 *
 * One way per session (5 Nov 2026, checkInWay): a booking's session only "Saya hadir" (no QR is
 * made for it, and a scan is refused), a panitia's session only its QR ("Saya hadir" is refused).
 */

const MIGRATION = "202611040005_pra_wam_attendance.sql";
type DbError = { code?: string; message?: string };
const missing = (error: DbError) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_attendance|qr_token/.test(error.message ?? "");
/** The proof column of migration 202611050003 is not there (checked before `missing`, whose words also match). */
export const proofColumnMissing = (error: DbError) => ["42703", "PGRST204"].includes(error.code ?? "") && /proof_key/.test(error.message ?? "");
/** The old method check refuses 'offline' and 'online' before migration 202611050003. */
const oldMethodCheck = (error: DbError) => error.code === "23514" && /pw_attendance_method_check/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Absen menunggu migrasi ${MIGRATION}.`);
const selfWaiting = (mode: "offline" | "online") => new ServiceError(503, mode === "online"
  ? `Absen online menunggu migrasi ${SELF_CHECK_IN_MIGRATION}. Hubungi panitia untuk dicatat manual.`
  : `Absen di kantor dengan "Saya hadir" menunggu migrasi ${SELF_CHECK_IN_MIGRATION}. Sementara itu scan QR yang ditempel di ruang.`);
function fail(error: DbError & { message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}

/** How long the agreed screenshot upload may be confirmed; the upload address itself lasts ten minutes. */
const PROOF_TOKEN_SECONDS = 15 * 60;
/** The storage address "Lihat bukti" redirects to. */
const PROOF_VIEW_SECONDS = 5 * 60;
const storageNotReady = () => new ServiceError(503, "Penyimpanan bukti belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");

function requireManager(viewer: Member) {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa mengatur absen.");
}

/** The session's QR token, made the first time panitia opens it. None for a booking's session. */
export async function qrToken(sessionId: string, viewer: Member, renew = false): Promise<string> {
  requireManager(viewer);
  const session = await getSession(sessionId, viewer);
  if (session.booking) throw new ServiceError(409, "Sesi dari booking ruang tidak memakai QR. Peserta absen dengan tombol Saya hadir.");
  const client = createPrivilegedClient();
  if (!renew) {
    const { data, error } = await client.from("pw_sessions").select("qr_token").eq("id", sessionId).single();
    if (error) fail(error);
    if (data.qr_token) return data.qr_token;
  }
  const token = newQrToken(size => randomBytes(size));
  const { error } = await client.from("pw_sessions").update({ qr_token: token, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) fail(error);
  return token;
}

/** A scan: who scanned, which session, and whether the window is open. */
export async function checkIn(token: string, member: Member, now = new Date()): Promise<{ result: CheckInResult; session: Pick<Session, "id" | "title"> | null }> {
  const client = createPrivilegedClient();
  const { data, error } = await withBookingLink(withLink => client.from("pw_sessions").select(withLink ? "id,title,status,starts_at,ends_at,booking_id" : "id,title,status,starts_at,ends_at").eq("qr_token", token).maybeSingle());
  if (error) fail(error);
  const session = data as (SessionRow & { title: string; booking_id?: string | null }) | null;
  if (!session) return { result: { kind: "tidak-dikenal" }, session: null };
  const named = { id: session.id, title: session.title };
  if (session.status !== "terbit" || !session.starts_at || !session.ends_at) return { result: { kind: "belum-terbit" }, session: named };
  // A booking's session takes "Saya hadir" only (an old QR printed before it was a booking's).
  if (session.booking_id) return { result: { kind: "pakai-tombol" }, session: named };
  const { data: participant, error: participantError } = await client.from("pw_session_participants").select("employee_id").eq("session_id", session.id).eq("employee_id", member.id).maybeSingle();
  if (participantError) fail(participantError);
  if (!participant) return { result: { kind: "bukan-peserta" }, session: named };
  const { data: existing, error: existingError } = await client.from("pw_attendance").select("checked_in_at").eq("session_id", session.id).eq("employee_id", member.id).maybeSingle();
  if (existingError) fail(existingError);
  if (existing) return { result: { kind: "sudah", checkedInAt: existing.checked_in_at }, session: named };
  const window = checkInWindow(session.starts_at, session.ends_at);
  const state = windowState(window, now);
  if (state !== "buka") return { result: { kind: state, window }, session: named };
  const { data: saved, error: saveError } = await client.from("pw_attendance")
    .upsert({ session_id: session.id, employee_id: member.id, method: "qr", checked_in_at: now.toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true })
    .select("checked_in_at");
  if (saveError) fail(saveError);
  return { result: { kind: saved?.length ? "tercatat" : "sudah", checkedInAt: saved?.[0]?.checked_in_at ?? now.toISOString() }, session: named };
}

/** Whether "Saya hadir" can be stored: the proof column is there. */
async function selfReady(): Promise<boolean> {
  const { error } = await createPrivilegedClient().from("pw_attendance").select("proof_key").limit(1);
  if (!error) return true;
  if (proofColumnMissing(error)) return false;
  fail(error);
}

type SessionRow = { id: string; status: string; starts_at: string | null; ends_at: string | null };

/**
 * Whether this person may sign themselves in to this session now: a participant of a published
 * session while the window is open and not signed in yet ("tercatat" means: go ahead). Otherwise
 * the refusal, or "sudah" with the check-in that is already there.
 */
async function selfCheckInGate(sessionId: string, member: Member, now: Date): Promise<{ result: CheckInResult; method: SelfCheckInAnswer["method"] }> {
  const client = createPrivilegedClient();
  const { data, error } = await withBookingLink(withLink => client.from("pw_sessions").select(withLink ? "id,status,starts_at,ends_at,booking_id" : "id,status,starts_at,ends_at").eq("id", sessionId).maybeSingle());
  if (error) fail(error);
  const session = data as (SessionRow & { booking_id?: string | null }) | null;
  if (!session) return { result: { kind: "tidak-dikenal" }, method: null };
  if (session.status !== "terbit" || !session.starts_at || !session.ends_at) return { result: { kind: "belum-terbit" }, method: null };
  // A panitia's session takes its QR only.
  if (!session.booking_id) return { result: { kind: "pakai-qr" }, method: null };
  // A booking outside WAM asks for no check-in (13 Nov 2026).
  const { data: purpose } = await client.from("pw_room_bookings").select("purpose").eq("id", session.booking_id).maybeSingle();
  if ((purpose as { purpose?: string } | null)?.purpose === "lain") return { result: { kind: "tanpa-absen" }, method: null };
  const { data: participant, error: participantError } = await client.from("pw_session_participants").select("employee_id").eq("session_id", session.id).eq("employee_id", member.id).maybeSingle();
  if (participantError) fail(participantError);
  if (!participant) return { result: { kind: "bukan-peserta" }, method: null };
  const { data: existing, error: existingError } = await client.from("pw_attendance").select("checked_in_at,method").eq("session_id", session.id).eq("employee_id", member.id).maybeSingle();
  if (existingError) fail(existingError);
  if (existing) return { result: { kind: "sudah", checkedInAt: existing.checked_in_at }, method: asMethod(existing.method) };
  const window = checkInWindow(session.starts_at, session.ends_at);
  const state = windowState(window, now);
  return state === "buka" ? { result: { kind: "tercatat", checkedInAt: now.toISOString() }, method: null } : { result: { kind: state, window }, method: null };
}

const clock = (iso: string) => clockLabel(wibTime(iso));
/** A gate that does not let the person in, as a clear error. "sudah" and "tercatat" pass. */
function refuse(result: CheckInResult): void {
  const text = selfCheckInRefusal(result, clock);
  if (!text) return;
  const status = result.kind === "tidak-dikenal" ? 404 : result.kind === "bukan-peserta" ? 403 : 409;
  throw new ServiceError(status, text);
}

function proofSignature(key: string, input: ProofStart, sessionId: string, member: Member, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(["absen", key, input.size, input.mime, sessionId, member.id, expires].join("\0")).digest("hex");
}

/** Whether the token was made for this key, type, size, session and person, and is still valid. */
export function proofTokenMatches(token: string, key: string, input: ProofStart, sessionId: string, member: Member, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(proofSignature(key, input, sessionId, member, expires), "hex"));
}

/**
 * Online, step one: where to put the Zoom screenshot, and a token to confirm it with. Only when
 * "Saya hadir" could be recorded right now, so nothing is uploaded for a closed session; someone
 * already signed in gets "sudah" instead.
 */
export async function startProofUpload(sessionId: string, input: ProofStart, member: Member, now = new Date()): Promise<{ kind: "unggah"; key: string; uploadUrl: string; token: string } | SelfCheckInAnswer> {
  if (!isR2Configured()) throw storageNotReady();
  const gate = await selfCheckInGate(sessionId, member, now);
  if (gate.result.kind === "sudah") return { kind: "sudah", checkedInAt: gate.result.checkedInAt, method: gate.method };
  refuse(gate.result);
  if (!(await selfReady())) throw selfWaiting("online");
  const key = proofKeyFor(sessionId, member.id, randomUUID(), input.mime);
  const expires = Math.floor(now.getTime() / 1000) + PROOF_TOKEN_SECONDS;
  return { kind: "unggah", key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${proofSignature(key, input, sessionId, member, expires)}` };
}

/** The uploaded screenshot is there, of the agreed size, and its first bytes are WebP or JPEG. */
async function checkProof(proof: Proof): Promise<void> {
  const start = await uploadedStart(proof.key, proof.size);
  if (!photoMagicMatches(proof.mime, start)) throw new ServiceError(422, "Isi berkas bukan gambar WebP atau JPEG. Pilih tangkapan layar lain.");
}

/**
 * "Saya hadir": offline at once; online after its screenshot is checked. One row per person, so a
 * second attempt answers "sudah tercatat". An uploaded screenshot that is not kept (a refusal, a
 * second attempt, a failed check) is deleted, but only one that is surely this person's upload.
 */
export async function selfCheckIn(sessionId: string, member: Member, input: SelfCheckIn, now = new Date()): Promise<SelfCheckInAnswer> {
  let proof: Proof | null = null;
  if (input.mode === "online") {
    const given = input.proof;
    if (!isOwnProofKey(given.key, sessionId, member.id, given.mime) || !proofTokenMatches(given.token, given.key, given, sessionId, member, now.getTime())) throw unknownUpload();
    if (!isR2Configured()) throw storageNotReady();
    proof = given;
  }
  const discard = async () => { if (proof) await removeObjects([proof.key]).catch(() => undefined); };
  try {
    const gate = await selfCheckInGate(sessionId, member, now);
    if (gate.result.kind === "sudah") { await discard(); return { kind: "sudah", checkedInAt: gate.result.checkedInAt, method: gate.method }; }
    refuse(gate.result);
    if (!(await selfReady())) throw selfWaiting(input.mode);
    if (proof) await checkProof(proof);
    const client = createPrivilegedClient();
    const { data, error } = await client.from("pw_attendance")
      .upsert({ session_id: sessionId, employee_id: member.id, method: input.mode, proof_key: proof?.key ?? null, checked_in_at: now.toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true })
      .select("checked_in_at,method");
    if (error) {
      if (proofColumnMissing(error) || oldMethodCheck(error)) throw selfWaiting(input.mode);
      fail(error);
    }
    if (data?.length) return { kind: "tercatat", checkedInAt: data[0].checked_in_at, method: input.mode };
    // Someone (a scan, panitia, another tab) signed them in a moment ago.
    await discard();
    proof = null;
    const { data: existing } = await client.from("pw_attendance").select("checked_in_at,method").eq("session_id", sessionId).eq("employee_id", member.id).maybeSingle();
    return { kind: "sudah", checkedInAt: existing?.checked_in_at ?? now.toISOString(), method: asMethod(existing?.method) };
  } catch (error) {
    await discard();
    throw error;
  }
}

/** Panitia and BOD: a short-lived storage address of someone's Zoom screenshot, or 404. */
export async function proofViewUrl(sessionId: string, employeeId: string, viewer: Member): Promise<string> {
  if (!seesAllSessions(viewer)) throw new ServiceError(403, "Hanya panitia dan BOD yang bisa melihat bukti hadir.");
  const none = new ServiceError(404, "Bukti hadir tidak ditemukan.");
  if (!isR2Configured()) throw none;
  const { data, error } = await createPrivilegedClient().from("pw_attendance").select("proof_key").eq("session_id", sessionId).eq("employee_id", employeeId).maybeSingle();
  if (error) { if (proofColumnMissing(error) || missing(error)) throw none; databaseError(error); }
  const key = (data as { proof_key: string | null } | null)?.proof_key;
  if (!key) throw none;
  return presignDownload(key, { seconds: PROOF_VIEW_SECONDS });
}

/** The person's own check-in for a session, for its page. */
export async function myCheckIn(sessionId: string, member: Member): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().from("pw_attendance").select("checked_in_at").eq("session_id", sessionId).eq("employee_id", member.id).maybeSingle();
  if (error) { if (missing(error)) return null; databaseError(error); }
  return data?.checked_in_at ?? null;
}

type PresentRow = { employee_id: string; checked_in_at: string; method: string; proof_key?: string | null };

/** Every participant with their check-in, how it was made, and whether a screenshot is kept (panitia and BOD). */
export async function attendance(sessionId: string, viewer: Member): Promise<AttendanceRow[]> {
  if (!seesAllSessions(viewer)) throw new ServiceError(403, "Hanya panitia dan BOD yang bisa melihat daftar hadir.");
  const session = await getSession(sessionId, viewer);
  const read = (columns: string) => createPrivilegedClient().from("pw_attendance").select(columns).eq("session_id", sessionId);
  let { data, error } = await read("employee_id,checked_in_at,method,proof_key");
  // Before migration 202611050003 there is no proof column (and no online check-in).
  if (error && proofColumnMissing(error)) ({ data, error } = await read("employee_id,checked_in_at,method"));
  if (error) fail(error);
  const present = (data ?? []) as unknown as PresentRow[];
  const people = await listPeople();
  const rows: AttendanceRow[] = (session.participants ?? []).map(person => {
    const row = present.find(item => item.employee_id === person.id);
    return { employeeId: person.id, name: person.name, department: person.department, checkedInAt: row?.checked_in_at ?? null, method: asMethod(row?.method), hasProof: !!row?.proof_key };
  });
  // Someone marked present by hand who is not (or no longer) on the list still counts.
  for (const row of present) {
    if (rows.some(item => item.employeeId === row.employee_id)) continue;
    const person = people.find(item => item.id === row.employee_id);
    rows.push({ employeeId: row.employee_id, name: person?.name ?? "Tanpa nama", department: person?.department ?? "", checkedInAt: row.checked_in_at, method: asMethod(row.method), hasProof: !!row.proof_key });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Panitia corrects by hand: present (recorded as manual, by whom) or not present. Removing an
 * online check-in also deletes its Zoom screenshot.
 */
export async function setPresent(sessionId: string, employeeId: string, present: boolean, viewer: Member): Promise<AttendanceRow[]> {
  requireManager(viewer);
  await getSession(sessionId, viewer);
  const client = createPrivilegedClient();
  if (present) {
    const { error } = await client.from("pw_attendance").upsert({ session_id: sessionId, employee_id: employeeId, method: "manual", recorded_by: viewer.id, checked_in_at: new Date().toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true });
    if (error) { if (error.code === "23503") throw new ServiceError(422, "Orang ini tidak dikenal. Muat ulang halaman."); fail(error); }
  } else {
    // Every column of the removed row: the proof's key when the column is there, nothing when not.
    const { data, error } = await client.from("pw_attendance").delete().eq("session_id", sessionId).eq("employee_id", employeeId).select();
    if (error) fail(error);
    const keys = ((data ?? []) as { proof_key?: string | null }[]).map(row => row.proof_key).filter((key): key is string => !!key);
    if (keys.length && isR2Configured()) await removeObjects(keys).catch(() => undefined);
  }
  return attendance(sessionId, viewer);
}
