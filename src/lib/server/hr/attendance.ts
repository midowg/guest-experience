import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CHALLENGE_SECONDS, CONSENT_VERSION, DAILY_MIGRATION, dailyStatus, faceKeyFor, instantOf, isOwnFaceKey, isOwnSelfieKey, selfieKeyFor, SELFIE_KEEP_DAYS, usableFace, workDate,
  type ClockInState, type DailyFlag, type DailyKind, type DailyRecord, type DailyStatus, type DayView, type EnrollInput, type FaceRow, type FaceSource, type FaceStatus, type HrSummary, type WaitingRecord,
  type ManualInput, type OfficeInput, type ReasonKind, type SubmitInput, type UploadStart,
} from "@/lib/hr/attendance";
import { average, cosine, FACE_MATCH, FACE_MODEL_VERSION, faceVerdict, isEmbedding, sameFace } from "@/lib/hr/face-match";
import { impossibleJump, locationVerdict, type OfficePoint } from "@/lib/hr/geo";
import { challengeDone, framesLookReal, pickChallenge, type LivenessStep } from "@/lib/hr/liveness";
import { photoMagicMatches, type PhotoMime } from "@/lib/pra-wam/photo";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { asViewerZone, zoneDate, type ViewerZone } from "@/lib/pra-wam/zone";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { copyObject, isR2Configured, presignDownload, presignUpload, readObject, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "../pra-wam/appraisal";
import type { Member } from "../pra-wam/session";
import { viewerZone } from "../pra-wam/zone";

/*
 * Absen harian kantor (migration 202611200701, decided 20 Nov 2026). See the rules in
 * src/lib/hr/attendance.ts. The flow for one clock-in:
 *   1. start: a nonce and its two liveness steps, signed for this person and purpose (3 minutes);
 *   2. upload: where the selfie goes in private R2, signed for this person, nonce, type and size;
 *   3. submit: the steps are judged again from the frames, the frames must be one face, the face is
 *      scored against the reference (which never leaves the server), the location against the
 *      office points, then one row is written (one masuk and one pulang per work day).
 * Anything refused deletes the uploaded selfie. Enrolment follows the same three steps.
 */

type DbError = { code?: string; message?: string };
const missing = (error: DbError) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_offices|pw_face_profiles|pw_daily_attendance/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Absen harian menunggu migrasi ${DAILY_MIGRATION}.`);
function fail(error: DbError & { message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}
const storageNotReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
const SELFIE_VIEW_SECONDS = 5 * 60;

/** Who acts in the admin: their employee row when they have one, and always a name for the record. */
export type AdminActorRef = { employeeId: string | null; label: string };

// ---------------------------------------------------------------------------------------------
// Tokens

type Purpose = DailyKind | "daftar";
const PURPOSES: Purpose[] = ["masuk", "pulang", "daftar"];

function secret(): string {
  const value = praWamSecret();
  if (!value) throw new ServiceError(503, "Login karyawan belum disiapkan.");
  return value;
}
const sign = (...parts: (string | number)[]) => createHmac("sha256", secret()).update(parts.join("\0")).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export type Challenge = { purpose: Purpose; nonce: string; steps: LivenessStep[]; token: string; expiresAt: string };

function newChallenge(purpose: Purpose, member: Member, now: Date): Challenge {
  const nonce = randomBytes(18).toString("base64url");
  const expires = Math.floor(now.getTime() / 1000) + CHALLENGE_SECONDS;
  return { purpose, nonce, steps: pickChallenge(nonce), token: `${expires}.${nonce}.${sign("absen-harian", purpose, member.id, nonce, expires)}`, expiresAt: new Date(expires * 1000).toISOString() };
}

/** The purpose and nonce a token was made for, by this person, still valid; else a clear error. */
export function readChallenge(token: string, member: Member, now = new Date()): { purpose: Purpose; nonce: string; expires: number } {
  const [expiresText, nonce, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || !nonce || !/^[0-9a-f]{64}$/.test(given ?? "")) throw new ServiceError(403, "Sesi absen tidak dikenali. Ulangi dari awal.");
  const purpose = PURPOSES.find(candidate => same(given, sign("absen-harian", candidate, member.id, nonce, expires)));
  if (!purpose) throw new ServiceError(403, "Sesi absen tidak dikenali. Ulangi dari awal.");
  if (expires * 1000 < now.getTime()) throw new ServiceError(410, "Waktu absen habis. Ulangi dari awal.");
  return { purpose, nonce, expires };
}

const uploadSignature = (key: string, mime: string, size: number, member: Member, nonce: string, expires: number) => sign("absen-harian-foto", key, mime, size, member.id, nonce, expires);

/** Step two: where the selfie (or the enrolment photo) goes, for this nonce only. */
export async function startUpload(member: Member, input: UploadStart, now = new Date()): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw storageNotReady();
  const { purpose, nonce, expires } = readChallenge(input.token, member, now);
  const key = purpose === "daftar" ? faceKeyFor(member.id, randomUUID(), input.mime) : selfieKeyFor(member.id, randomUUID(), input.mime);
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${uploadSignature(key, input.mime, input.size, member, nonce, expires)}` };
}

type Upload = { key: string; mime: PhotoMime; size: number; token: string };
function uploadMatches(upload: Upload, member: Member, nonce: string, expires: number): boolean {
  const [expiresText, given] = upload.token.split(".");
  return Number(expiresText) === expires && /^[0-9a-f]{64}$/.test(given ?? "") && same(given, uploadSignature(upload.key, upload.mime, upload.size, member, nonce, expires));
}
async function checkUploaded(upload: Upload): Promise<void> {
  const start = await uploadedStart(upload.key, upload.size).catch(() => { throw new ServiceError(422, "Foto belum sampai di penyimpanan. Ulangi."); });
  if (!photoMagicMatches(upload.mime, start)) throw new ServiceError(422, "Isi berkas bukan gambar WebP atau JPEG. Ulangi.");
}

// ---------------------------------------------------------------------------------------------
// Reading

type OfficeRow = { id: string; name: string; lat: number; lng: number; radius_m: number; zone: string; active: boolean; sort_order: number };
type Office = OfficePoint & { zone: ViewerZone; active: boolean };
const asOffice = (row: OfficeRow): Office => ({ id: row.id, name: row.name, lat: row.lat, lng: row.lng, radiusM: row.radius_m, zone: asViewerZone(row.zone), active: row.active });

async function offices(all = false): Promise<Office[]> {
  let query = createPrivilegedClient().from("pw_offices").select("id,name,lat,lng,radius_m,zone,active,sort_order").order("sort_order").order("name");
  if (!all) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) fail(error);
  return ((data ?? []) as OfficeRow[]).map(asOffice);
}

type ProfileRow = {
  employee_id: string; embedding: number[] | null; model_version: string | null; photo_key: string | null; source: FaceSource; status: FaceStatus;
  note: string | null; consent_at: string | null; updated_at: string;
};
const PROFILE_COLUMNS = "employee_id,embedding,model_version,photo_key,source,status,note,consent_at,updated_at";

async function profileOf(employeeId: string): Promise<ProfileRow | null> {
  const { data, error } = await createPrivilegedClient().from("pw_face_profiles").select(PROFILE_COLUMNS).eq("employee_id", employeeId).maybeSingle();
  if (error) fail(error);
  return (data as ProfileRow | null) ?? null;
}

type RecordRow = {
  id: string; employee_id: string; work_date: string; kind: DailyKind; at: string; method: "wajah" | "manual"; status: DailyStatus; flags: string[] | null;
  office_name: string | null; lat: number | null; lng: number | null; distance_m: number | null; accuracy_m: number | null; face_score: number | null;
  reason_kind: ReasonKind | null; reason_text: string | null; selfie_key: string | null; review_note: string | null;
};
const RECORD_COLUMNS = "id,employee_id,work_date,kind,at,method,status,flags,office_name,lat,lng,distance_m,accuracy_m,face_score,reason_kind,reason_text,selfie_key,review_note";
const asRecord = (row: RecordRow): DailyRecord => ({
  id: row.id, kind: row.kind, at: row.at, workDate: row.work_date, method: row.method, status: row.status, flags: (row.flags ?? []) as DailyFlag[],
  officeName: row.office_name, distanceM: row.distance_m, accuracyM: row.accuracy_m, faceScore: row.face_score,
  reasonKind: row.reason_kind, reasonText: row.reason_text, hasSelfie: Boolean(row.selfie_key), reviewNote: row.review_note,
});

const daysBefore = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The person's clock-in screen. Before the migration it says what it waits for instead of failing. */
export async function clockInState(member: Member, now = new Date()): Promise<ClockInState> {
  const zone = await viewerZone();
  const today = zoneDate(now.toISOString(), zone);
  const empty: ClockInState = { ready: false, waiting: null, face: null, today: { workDate: today, masuk: null, pulang: null }, offices: [], recent: [] };
  if (!praWamSecret()) return { ...empty, waiting: "Login karyawan belum disiapkan." };
  try {
    const client = createPrivilegedClient();
    const [list, profile, { data, error }] = await Promise.all([
      offices(),
      profileOf(member.id),
      client.from("pw_daily_attendance").select(RECORD_COLUMNS).eq("employee_id", member.id).gte("work_date", daysBefore(today, 14)).order("at", { ascending: false }),
    ]);
    if (error) fail(error);
    const records = ((data ?? []) as RecordRow[]).map(asRecord);
    const usable = profile && (profile.status === "impor" || profile.model_version === FACE_MODEL_VERSION) ? profile : profile ? { ...profile, status: "ditolak" as const } : null;
    return {
      ready: isR2Configured(),
      waiting: isR2Configured() ? null : "Penyimpanan foto belum disiapkan.",
      face: usable ? { status: usable.status, source: usable.source, consented: Boolean(usable.consent_at) } : null,
      today: {
        workDate: today,
        masuk: records.find(record => record.workDate === today && record.kind === "masuk") ?? null,
        pulang: records.find(record => record.workDate === today && record.kind === "pulang") ?? null,
      },
      offices: list.map(({ id, name, lat, lng, radiusM, zone: officeZone }) => ({ id, name, lat, lng, radiusM, zone: officeZone })),
      recent: records,
    };
  } catch (error) {
    if (error instanceof ServiceError && error.status === 503) return { ...empty, waiting: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Clock-in

export type StartAnswer =
  | { kind: "tantangan"; challenge: Challenge; needsConsent: boolean }
  | { kind: "sudah"; record: DailyRecord }
  | { kind: "daftar"; message: string };

/** Step one of a clock-in. Someone without a usable face is sent to enrol first. */
export async function startClockIn(member: Member, kind: DailyKind, now = new Date()): Promise<StartAnswer> {
  if (!isR2Configured()) throw storageNotReady();
  const profile = await profileOf(member.id);
  if (!profile || !usableFace(profile.status) || profile.model_version !== FACE_MODEL_VERSION || !isEmbedding(profile.embedding)) {
    return { kind: "daftar", message: profile?.status === "impor" ? "Foto acuanmu belum diproses Admin HR. Daftarkan wajahmu sekarang." : "Daftarkan wajahmu dulu, sekali saja." };
  }
  const zone = await viewerZone();
  const today = zoneDate(now.toISOString(), zone);
  const { data, error } = await createPrivilegedClient().from("pw_daily_attendance").select(RECORD_COLUMNS).eq("employee_id", member.id).eq("work_date", today).eq("kind", kind).maybeSingle();
  if (error) fail(error);
  if (data) return { kind: "sudah", record: asRecord(data as RecordRow) };
  return { kind: "tantangan", challenge: newChallenge(kind, member, now), needsConsent: profile.status === "siap" };
}

/** Liveness and one-face checks shared by clock-in and enrolment. */
function checkLiving(nonce: string, signals: SubmitInput["signals"], frames: number[][]) {
  if (!framesLookReal(signals) || !challengeDone(pickChallenge(nonce), signals)) throw new ServiceError(422, "Gerakan wajah belum terbaca. Ulangi dan ikuti petunjuknya.");
  if (!sameFace(frames)) throw new ServiceError(422, "Wajah di kamera berganti di tengah jalan. Ulangi dengan wajahmu sendiri.");
}

export type SubmitAnswer = { kind: "tercatat" | "sudah"; record: DailyRecord };

/** Step three: judge everything again and write the one row. */
export async function submitClockIn(member: Member, input: SubmitInput, now = new Date()): Promise<SubmitAnswer> {
  const { purpose, nonce, expires } = readChallenge(input.token, member, now);
  if (purpose === "daftar") throw new ServiceError(403, "Sesi absen tidak dikenali. Ulangi dari awal.");
  const selfie = input.selfie;
  if (!isOwnSelfieKey(selfie.key, member.id, selfie.mime) || !uploadMatches(selfie, member, nonce, expires)) throw unknownUpload();
  if (!isR2Configured()) throw storageNotReady();
  let keep = false;
  try {
    checkLiving(nonce, input.signals, input.frameEmbeddings);
    if (cosine(input.embedding, average(input.frameEmbeddings)) < 0.98) throw new ServiceError(422, "Data wajah tidak lengkap. Ulangi dari awal.");

    const profile = await profileOf(member.id);
    if (!profile || !usableFace(profile.status) || profile.model_version !== FACE_MODEL_VERSION || !isEmbedding(profile.embedding)) throw new ServiceError(409, "Daftarkan wajahmu dulu, sekali saja.");
    if (profile.status === "siap" && input.consent !== CONSENT_VERSION) throw new ServiceError(409, "Setujui pemakaian data wajah dulu.");
    const score = cosine(input.embedding, profile.embedding);
    const face = faceVerdict(score);
    if (face === "tidak_cocok") throw new ServiceError(422, "Wajah belum cocok dengan wajah terdaftar. Cari tempat terang, lihat lurus ke kamera, lalu coba lagi.");

    const reading = { lat: input.location.lat, lng: input.location.lng, accuracyM: input.location.accuracyM };
    const place = locationVerdict(reading, await offices());
    if (place.kind === "di_luar" && !input.reason) throw new ServiceError(422, "Kamu di luar area kantor. Pilih alasannya dulu.");
    const zone = place.kind === "di_dalam" ? place.office.zone : await viewerZone();
    const at = now.toISOString();
    const date = workDate(at, zone);

    const client = createPrivilegedClient();
    const [{ data: last }, { data: masuk }] = await Promise.all([
      client.from("pw_daily_attendance").select("lat,lng,at").eq("employee_id", member.id).not("lat", "is", null).order("at", { ascending: false }).limit(1).maybeSingle(),
      purpose === "pulang" ? client.from("pw_daily_attendance").select("id").eq("employee_id", member.id).eq("work_date", date).eq("kind", "masuk").maybeSingle() : Promise.resolve({ data: { id: "-" } }),
    ]);
    const previous = last as { lat: number; lng: number; at: string } | null;
    const { status, flags } = dailyStatus({
      inside: place.kind === "di_dalam",
      outsideWhy: place.kind === "di_luar" ? place.why : undefined,
      face,
      faceStatus: profile.status,
      jumped: previous ? impossibleJump(previous, { ...reading, at }) : false,
      pulangWithoutMasuk: purpose === "pulang" && !masuk,
    });
    await checkUploaded(selfie);

    const { data, error } = await client.from("pw_daily_attendance").upsert({
      employee_id: member.id, work_date: date, kind: purpose, at, method: "wajah",
      office_id: place.kind === "di_dalam" ? place.office.id : null,
      office_name: place.kind === "di_dalam" ? place.office.name : place.nearest?.office.name ?? null,
      lat: reading.lat, lng: reading.lng, accuracy_m: reading.accuracyM,
      distance_m: place.kind === "di_dalam" ? place.distanceM : place.nearest?.distanceM ?? null,
      face_score: score, embedding: input.embedding, liveness_steps: pickChallenge(nonce), selfie_key: selfie.key,
      reason_kind: place.kind === "di_luar" ? input.reason!.kind : null,
      reason_text: place.kind === "di_luar" ? input.reason!.text || null : null,
      status, flags, nonce,
    }, { onConflict: "employee_id,work_date,kind", ignoreDuplicates: true }).select(RECORD_COLUMNS);
    if (error) fail(error);
    if (profile.status === "siap") {
      // The first clock-in with an imported GreatDay face: the person agreed, so it is theirs now.
      await client.from("pw_face_profiles").update({ status: "aktif", consent_at: at, consent_version: CONSENT_VERSION, updated_at: at }).eq("employee_id", member.id).eq("status", "siap");
    }
    if (data?.length) { keep = true; return { kind: "tercatat", record: asRecord(data[0] as RecordRow) }; }
    const { data: existing } = await client.from("pw_daily_attendance").select(RECORD_COLUMNS).eq("employee_id", member.id).eq("work_date", date).eq("kind", purpose).maybeSingle();
    return { kind: "sudah", record: asRecord(existing as RecordRow) };
  } finally {
    if (!keep) await removeObjects([selfie.key]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// Enrolment

/** Step one of enrolling. A face already in use is changed only through an admin. */
export async function startEnroll(member: Member, now = new Date()): Promise<Challenge> {
  if (!isR2Configured()) throw storageNotReady();
  const profile = await profileOf(member.id);
  if (profile && (profile.status === "aktif" || profile.status === "menunggu") && profile.model_version === FACE_MODEL_VERSION) {
    throw new ServiceError(409, profile.status === "aktif" ? "Wajahmu sudah terdaftar. Untuk daftar ulang, minta Admin HR." : "Wajahmu sudah didaftarkan dan menunggu persetujuan Admin HR.");
  }
  return newChallenge("daftar", member, now);
}

/**
 * Step three of enrolling. When an imported GreatDay face is there, the new face is compared with
 * it: a match is in use at once (HR's photo vouches for it); otherwise an admin looks.
 */
export async function submitEnroll(member: Member, input: EnrollInput, now = new Date()): Promise<{ status: FaceStatus }> {
  const { purpose, nonce, expires } = readChallenge(input.token, member, now);
  if (purpose !== "daftar") throw new ServiceError(403, "Sesi daftar wajah tidak dikenali. Ulangi dari awal.");
  const photo = input.photo;
  if (!isOwnFaceKey(photo.key, member.id, photo.mime) || !uploadMatches(photo, member, nonce, expires)) throw unknownUpload();
  if (!isR2Configured()) throw storageNotReady();
  let keep = false;
  try {
    checkLiving(nonce, input.signals, input.embeddings);
    const before = await profileOf(member.id);
    if (before && (before.status === "aktif" || before.status === "menunggu") && before.model_version === FACE_MODEL_VERSION) throw new ServiceError(409, "Wajahmu sudah terdaftar.");
    const reference = average(input.embeddings);
    const vouched = before?.source === "greatday" && isEmbedding(before.embedding) && before.model_version === FACE_MODEL_VERSION && cosine(reference, before.embedding) >= FACE_MATCH.cocok;
    const status: FaceStatus = vouched ? "aktif" : "menunggu";
    await checkUploaded(photo);
    const at = now.toISOString();
    const { error } = await createPrivilegedClient().from("pw_face_profiles").upsert({
      employee_id: member.id, embedding: reference, model_version: FACE_MODEL_VERSION, photo_key: photo.key, source: "daftar", status,
      note: vouched ? "Cocok dengan foto GreatDay" : before?.source === "greatday" && isEmbedding(before.embedding) ? "Tidak cocok dengan foto GreatDay" : null,
      consent_at: at, consent_version: CONSENT_VERSION, approved_by: null, approved_label: vouched ? "Cocok dengan foto GreatDay" : null, approved_at: vouched ? at : null, updated_at: at,
    }, { onConflict: "employee_id" });
    if (error) fail(error);
    keep = true;
    if (before?.photo_key && before.photo_key !== photo.key) await removeObjects([before.photo_key]).catch(() => undefined);
    return { status };
  } finally {
    if (!keep) await removeObjects([photo.key]).catch(() => undefined);
  }
}

/**
 * Data wajah → Hapus: the person withdraws consent. Their reference and every selfie
 * still kept are deleted; their clock-ins stay (times and places), and Admin HR records new ones.
 */
export async function withdrawFace(member: Member): Promise<void> {
  const client = createPrivilegedClient();
  const profile = await profileOf(member.id);
  const { data, error } = await client.from("pw_daily_attendance").select("selfie_key").eq("employee_id", member.id).not("selfie_key", "is", null);
  if (error) fail(error);
  const keys = [profile?.photo_key, ...((data ?? []) as { selfie_key: string }[]).map(row => row.selfie_key)].filter((key): key is string => Boolean(key));
  if (keys.length && isR2Configured()) await removeObjects(keys);
  const updated = await client.from("pw_daily_attendance").update({ selfie_key: null, embedding: null }).eq("employee_id", member.id);
  if (updated.error) fail(updated.error);
  const removed = await client.from("pw_face_profiles").delete().eq("employee_id", member.id);
  if (removed.error) fail(removed.error);
}

// ---------------------------------------------------------------------------------------------
// Admin

/** Everyone who should clock in: active in Data karyawan with an active employee account (the one WAM and Booking use too). */
async function clockers(): Promise<{ id: string; fullName: string; department: string }[]> {
  const [people, { data, error }] = await Promise.all([
    listPeople(),
    createPrivilegedClient().from("pw_accounts").select("employee_id").eq("active", true),
  ]);
  if (error) databaseError(error);
  const accounts = new Set(((data ?? []) as { employee_id: string }[]).map(row => row.employee_id));
  return people.filter(person => person.active && accounts.has(person.id)).map(person => ({ id: person.id, fullName: person.fullName, department: person.department }));
}

export async function adminDay(date: string): Promise<DayView> {
  const client = createPrivilegedClient();
  const [people, list, records, faces] = await Promise.all([
    clockers(),
    offices(true),
    client.from("pw_daily_attendance").select(RECORD_COLUMNS).eq("work_date", date),
    client.from("pw_face_profiles").select("employee_id,status"),
  ]);
  if (records.error) fail(records.error);
  if (faces.error) fail(faces.error);
  const rows = (records.data ?? []) as RecordRow[];
  const face = new Map(((faces.data ?? []) as { employee_id: string; status: FaceStatus }[]).map(row => [row.employee_id, row.status]));
  const find = (id: string, kind: DailyKind) => { const row = rows.find(item => item.employee_id === id && item.kind === kind); return row ? asRecord(row) : null; };
  return {
    date,
    people: people.map(person => ({ employeeId: person.id, name: person.fullName, department: person.department, face: face.get(person.id) ?? null, masuk: find(person.id, "masuk"), pulang: find(person.id, "pulang") })),
    offices: list.map(({ id, name, lat, lng, radiusM, zone }) => ({ id, name, lat, lng, radiusM, zone })),
  };
}

/** Perlu dicek: every clock-in that waits, newest first, with whose it is (at most 300). */
export async function waitingRecords(): Promise<WaitingRecord[]> {
  const client = createPrivilegedClient();
  const [people, records, faces] = await Promise.all([
    listPeople(),
    client.from("pw_daily_attendance").select(RECORD_COLUMNS).eq("status", "perlu_cek").order("at", { ascending: false }).limit(300),
    client.from("pw_face_profiles").select("employee_id,status"),
  ]);
  if (records.error) fail(records.error);
  if (faces.error) fail(faces.error);
  const byId = new Map(people.map(person => [person.id, person]));
  const face = new Map(((faces.data ?? []) as { employee_id: string; status: FaceStatus }[]).map(row => [row.employee_id, row.status]));
  return ((records.data ?? []) as RecordRow[]).map(row => ({
    ...asRecord(row), employeeId: row.employee_id, name: byId.get(row.employee_id)?.fullName ?? "(tidak dikenal)",
    department: byId.get(row.employee_id)?.department ?? "", face: face.get(row.employee_id) ?? null,
  }));
}

/** How many clock-ins wait, for the admin home's HR card; null before the migration. */
export async function waitingCount(): Promise<number | null> {
  const { count, error } = await createPrivilegedClient().from("pw_daily_attendance").select("id", { count: "exact", head: true }).eq("status", "perlu_cek");
  return error ? null : count ?? 0;
}

/** Ringkasan: today's numbers (in WIB, the office's day) and what still needs setting up. */
export async function hrSummary(date: string): Promise<HrSummary> {
  const client = createPrivilegedClient();
  const [people, list, today, waiting, faces] = await Promise.all([
    clockers(),
    offices(true),
    client.from("pw_daily_attendance").select("employee_id,kind,office_id,method").eq("work_date", date),
    client.from("pw_daily_attendance").select("id", { count: "exact", head: true }).eq("status", "perlu_cek"),
    client.from("pw_face_profiles").select("employee_id,status"),
  ]);
  if (today.error) fail(today.error);
  if (waiting.error) fail(waiting.error);
  if (faces.error) fail(faces.error);
  const rows = (today.data ?? []) as { employee_id: string; kind: DailyKind; office_id: string | null; method: "wajah" | "manual" }[];
  const clocking = new Set(people.map(person => person.id));
  const masuk = new Set(rows.filter(row => row.kind === "masuk" && clocking.has(row.employee_id)).map(row => row.employee_id));
  const faceRows = (faces.data ?? []) as { employee_id: string; status: FaceStatus }[];
  const counts: HrSummary["faces"] = { aktif: 0, siap: 0, impor: 0, menunggu: 0, ditolak: 0, tanpa: 0 };
  const withFace = new Set<string>();
  for (const row of faceRows) { counts[row.status] += 1; withFace.add(row.employee_id); }
  counts.tanpa = people.filter(person => !withFace.has(person.id)).length;
  return {
    date,
    people: people.length,
    masuk: masuk.size,
    pulang: rows.filter(row => row.kind === "pulang" && clocking.has(row.employee_id)).length,
    belum: people.length - masuk.size,
    diLuar: rows.filter(row => row.method === "wajah" && !row.office_id).length,
    waiting: waiting.count ?? 0,
    offices: list.filter(office => office.active).length,
    faces: counts,
  };
}

export async function reviewRecord(id: string, review: { status: "sah" | "ditolak"; note: string }, actor: AdminActorRef, now = new Date()): Promise<DailyRecord> {
  const { data, error } = await createPrivilegedClient().from("pw_daily_attendance")
    .update({ status: review.status, review_note: review.note || null, reviewed_by: actor.employeeId, reviewed_label: actor.label, reviewed_at: now.toISOString() })
    .eq("id", id).select(RECORD_COLUMNS).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Absen tidak ditemukan.");
  return asRecord(data as RecordRow);
}

/**
 * Admin HR → "Hapus absen": a clock-in (test data, a mistake) gone for good, with its selfie. The
 * row goes first, so a failed file delete leaves at most an orphan file, never a row without its file.
 */
export async function deleteRecord(id: string): Promise<DailyRecord> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_daily_attendance").select(RECORD_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Absen tidak ditemukan; mungkin sudah dihapus.");
  const row = data as RecordRow;
  const removed = await client.from("pw_daily_attendance").delete().eq("id", id);
  if (removed.error) fail(removed.error);
  if (row.selfie_key && isR2Configured()) await removeObjects([row.selfie_key]).catch(() => undefined);
  return asRecord(row);
}

/** An admin records a clock-in by hand (no face consent, a broken phone, a forgotten clock-in). */
export async function recordManual(input: ManualInput, actor: AdminActorRef): Promise<DailyRecord> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_daily_attendance").insert({
    employee_id: input.employeeId, work_date: input.workDate, kind: input.kind, at: instantOf(input.workDate, input.time, input.zone), method: "manual",
    status: "sah", flags: [], review_note: input.note, recorded_by: actor.employeeId, recorded_label: actor.label,
  }).select(RECORD_COLUMNS).maybeSingle();
  if (error) {
    if (error.code === "23505") throw new ServiceError(409, `Absen ${input.kind} orang ini di tanggal itu sudah ada.`);
    fail(error);
  }
  return asRecord(data as RecordRow);
}

async function keyOf(id: string): Promise<string> {
  const { data, error } = await createPrivilegedClient().from("pw_daily_attendance").select("selfie_key").eq("id", id).maybeSingle();
  if (error) fail(error);
  const key = (data as { selfie_key: string | null } | null)?.selfie_key;
  if (!key) throw new ServiceError(404, "Selfie tidak ada (sudah dihapus setelah 90 hari, atau dicatat manual).");
  return key;
}
/** A five-minute link to a clock-in's selfie. */
export async function selfieUrl(id: string): Promise<string> {
  if (!isR2Configured()) throw storageNotReady();
  return presignDownload(await keyOf(id), { seconds: SELFIE_VIEW_SECONDS });
}
/** A five-minute link to someone's reference photo. */
export async function facePhotoUrl(employeeId: string): Promise<string> {
  if (!isR2Configured()) throw storageNotReady();
  const profile = await profileOf(employeeId);
  if (!profile?.photo_key) throw new ServiceError(404, "Foto acuan tidak ada.");
  return presignDownload(profile.photo_key, { seconds: SELFIE_VIEW_SECONDS });
}
/** The reference photo's bytes, for "Proses foto impor" in the admin's browser (same origin, no CORS). */
export async function facePhotoBytes(employeeId: string): Promise<{ bytes: Uint8Array; type: string }> {
  if (!isR2Configured()) throw storageNotReady();
  const profile = await profileOf(employeeId);
  const file = profile?.photo_key ? await readObject(profile.photo_key) : null;
  if (!file) throw new ServiceError(404, "Foto acuan tidak ada.");
  return { bytes: file.bytes, type: profile!.photo_key!.endsWith(".webp") ? "image/webp" : "image/jpeg" };
}

export async function listFaces(): Promise<FaceRow[]> {
  const [people, { data, error }] = await Promise.all([
    listPeople(),
    createPrivilegedClient().from("pw_face_profiles").select(PROFILE_COLUMNS),
  ]);
  if (error) fail(error);
  const byId = new Map(people.map(person => [person.id, person]));
  return ((data ?? []) as ProfileRow[]).map(row => ({
    employeeId: row.employee_id, name: byId.get(row.employee_id)?.fullName ?? "(tidak dikenal)", department: byId.get(row.employee_id)?.department ?? "",
    status: row.status, source: row.source, note: row.note, consented: Boolean(row.consent_at), hasPhoto: Boolean(row.photo_key),
    hasEmbedding: isEmbedding(row.embedding) && row.model_version === FACE_MODEL_VERSION, updatedAt: row.updated_at,
  })).sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/**
 * "Proses foto impor": the admin's browser read a GreatDay photo with the same engine as the
 * phones. A readable one is ready for the person's consent; an unreadable one asks them to enrol.
 */
export async function setImportedFace(employeeId: string, result: { embedding: number[] } | { problem: string }, now = new Date()): Promise<FaceStatus> {
  const profile = await profileOf(employeeId);
  if (!profile || profile.source !== "greatday" || !["impor", "siap", "ditolak"].includes(profile.status)) throw new ServiceError(409, "Foto ini bukan foto impor yang menunggu diproses.");
  const update = "embedding" in result
    ? { embedding: result.embedding, model_version: FACE_MODEL_VERSION, status: "siap" as const, note: null }
    : { embedding: null, model_version: null, status: "ditolak" as const, note: `Foto tidak terbaca: ${result.problem}`.slice(0, 300) };
  const { error } = await createPrivilegedClient().from("pw_face_profiles").update({ ...update, updated_at: now.toISOString() }).eq("employee_id", employeeId);
  if (error) fail(error);
  return update.status;
}

export async function decideFace(employeeId: string, decision: "setujui" | "tolak" | "reset", actor: AdminActorRef, note = "", now = new Date()): Promise<void> {
  const client = createPrivilegedClient();
  const profile = await profileOf(employeeId);
  if (!profile) throw new ServiceError(404, "Wajah orang ini belum terdaftar.");
  if (decision === "reset") {
    if (profile.photo_key && isR2Configured()) await removeObjects([profile.photo_key]).catch(() => undefined);
    const { error } = await client.from("pw_face_profiles").delete().eq("employee_id", employeeId);
    if (error) fail(error);
    return;
  }
  if (decision === "setujui" && profile.status !== "menunggu") throw new ServiceError(409, "Hanya wajah yang menunggu persetujuan yang bisa disetujui.");
  const { error } = await client.from("pw_face_profiles").update(decision === "setujui"
    ? { status: "aktif", approved_by: actor.employeeId, approved_label: actor.label, approved_at: now.toISOString(), updated_at: now.toISOString() }
    : { status: "ditolak", note: note || "Ditolak Admin HR", updated_at: now.toISOString() }).eq("employee_id", employeeId);
  if (error) fail(error);
}

/** "Ganti acuan dengan selfie ini": a clock-in the admin trusts becomes the person's reference. */
export async function selfieAsReference(recordId: string, actor: AdminActorRef, now = new Date()): Promise<void> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_daily_attendance").select("employee_id,selfie_key,embedding").eq("id", recordId).maybeSingle();
  if (error) fail(error);
  const row = data as { employee_id: string; selfie_key: string | null; embedding: number[] | null } | null;
  if (!row?.selfie_key || !isEmbedding(row.embedding)) throw new ServiceError(404, "Selfie atau data wajahnya sudah tidak ada.");
  const profile = await profileOf(row.employee_id);
  if (!profile?.consent_at) throw new ServiceError(409, "Orang ini belum menyetujui pemakaian data wajah.");
  if (!isR2Configured()) throw storageNotReady();
  const mime: PhotoMime = row.selfie_key.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const key = faceKeyFor(row.employee_id, randomUUID(), mime);
  await copyObject(row.selfie_key, key, mime);
  const { error: updateError } = await client.from("pw_face_profiles").update({
    embedding: row.embedding, model_version: FACE_MODEL_VERSION, photo_key: key, source: "daftar", status: "aktif", note: "Dari selfie absen",
    approved_by: actor.employeeId, approved_label: actor.label, approved_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq("employee_id", row.employee_id);
  if (updateError) { await removeObjects([key]).catch(() => undefined); fail(updateError); }
  if (profile.photo_key) await removeObjects([profile.photo_key]).catch(() => undefined);
}

export async function listOffices(): Promise<(ClockInState["offices"][number] & { active: boolean })[]> {
  return (await offices(true)).map(({ id, name, lat, lng, radiusM, zone, active }) => ({ id, name, lat, lng, radiusM, zone, active }));
}
const officeRow = (input: OfficeInput) => ({ name: input.name, lat: input.lat, lng: input.lng, radius_m: input.radiusM, zone: input.zone, active: input.active });
export async function saveOffice(input: OfficeInput, id?: string): Promise<void> {
  const client = createPrivilegedClient();
  const { error } = id
    ? await client.from("pw_offices").update({ ...officeRow(input), updated_at: new Date().toISOString() }).eq("id", id)
    : await client.from("pw_offices").insert(officeRow(input));
  if (error) {
    if (error.code === "23505") throw new ServiceError(409, "Nama kantor sudah dipakai titik lain.");
    fail(error);
  }
}
/** Old clock-ins keep the office's name (office_name); the point itself goes. */
export async function deleteOffice(id: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_offices").delete().eq("id", id);
  if (error) fail(error);
}

// ---------------------------------------------------------------------------------------------
// Cleanup

/** Kelola → "Hapus selfie lama": selfies (and their embeddings) older than 90 days, in batches. Returns how many were deleted. */
export async function deleteOldSelfies(now = new Date()): Promise<number> {
  if (!isR2Configured()) return 0;
  const client = createPrivilegedClient();
  const before = new Date(now.getTime() - SELFIE_KEEP_DAYS * 86_400_000).toISOString();
  let total = 0;
  for (let round = 0; round < 20; round += 1) {
    const { data, error } = await client.from("pw_daily_attendance").select("id,selfie_key").not("selfie_key", "is", null).lt("at", before).limit(500);
    if (error) fail(error);
    const rows = (data ?? []) as { id: string; selfie_key: string }[];
    if (!rows.length) break;
    await removeObjects(rows.map(row => row.selfie_key));
    const { error: updateError } = await client.from("pw_daily_attendance").update({ selfie_key: null, embedding: null }).in("id", rows.map(row => row.id));
    if (updateError) fail(updateError);
    total += rows.length;
    if (rows.length < 500) break;
  }
  return total;
}
