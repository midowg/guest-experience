import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CHALLENGE_SECONDS, CONSENT_VERSION, usableFace, type FaceStatus } from "@/lib/hr/attendance";
import { average, cosine, FACE_MODEL_VERSION, faceVerdict, isEmbedding, matchPercent, sameFace } from "@/lib/hr/face-match";
import { framesLookReal } from "@/lib/hr/liveness";
import {
  asMethod, FACE_CHECK_IN_MIGRATION, isOwnProofKey, proofKeyFor,
  type FaceCheckIn, type FaceCheckInAnswer, type FaceStartAnswer, type FaceUpload,
} from "@/lib/pra-wam/attendance";
import { photoMagicMatches } from "@/lib/pra-wam/photo";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { faceColumnsMissing, refuse, selfCheckInGate } from "./attendance";
import type { Member } from "./session";

/*
 * Absen sesi pakai wajah (migration 202611290001, decided 22 Nov 2026). The same three steps as WG
 * People's clock-in (src/lib/server/hr/attendance.ts), for one session:
 *   1. start: the session's window is open, the person takes part, and has a usable WG People face;
 *      a nonce signed for this session and person (3 minutes);
 *   2. upload: where the photo goes in private R2, under this session's proof folder, signed for
 *      the nonce, type and size;
 *   3. submit: the frames must be one face and agree with the embedding, the embedding is scored
 *      against the reference face (which never leaves the server), then one row is written.
 * Tidak cocok writes nothing and deletes the photo; so does anything refused.
 */

export const faceWaiting = () => new ServiceError(503, `Absen wajah menunggu migrasi ${FACE_CHECK_IN_MIGRATION}. Sementara itu scan QR di ruang.`);
const storageNotReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Pakai scan QR dulu.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
const unknownToken = () => new ServiceError(403, "Sesi absen tidak dikenali. Ulangi dari awal.");
/** The reference photo beside the result, a short-lived address. */
const REFERENCE_VIEW_SECONDS = 5 * 60;

function secret(): string {
  const value = praWamSecret();
  if (!value) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return value;
}
const sign = (...parts: (string | number)[]) => createHmac("sha256", secret()).update(parts.join("\0")).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

/** The nonce a token was made for, by this person for this session, still valid; else a clear error. */
export function readFaceToken(token: string, sessionId: string, member: Member, now = new Date()): { nonce: string; expires: number } {
  const [expiresText, nonce, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || !nonce || !/^[0-9a-f]{64}$/.test(given ?? "")) throw unknownToken();
  if (!same(given, sign("wam-wajah", sessionId, member.id, nonce, expires))) throw unknownToken();
  if (expires * 1000 < now.getTime()) throw new ServiceError(410, "Waktu absen habis. Ulangi dari awal.");
  return { nonce, expires };
}
export function newFaceToken(sessionId: string, member: Member, now: Date): { token: string; expiresAt: string } {
  const nonce = randomBytes(18).toString("base64url");
  const expires = Math.floor(now.getTime() / 1000) + CHALLENGE_SECONDS;
  return { token: `${expires}.${nonce}.${sign("wam-wajah", sessionId, member.id, nonce, expires)}`, expiresAt: new Date(expires * 1000).toISOString() };
}
const uploadSignature = (key: string, mime: string, size: number, sessionId: string, member: Member, nonce: string, expires: number) =>
  sign("wam-wajah-foto", key, mime, size, sessionId, member.id, nonce, expires);

/** Whether a face check-in can be stored: the columns of 202611290001 are there. */
export async function faceReady(): Promise<boolean> {
  const { error } = await createPrivilegedClient().from("pw_attendance").select("face_score").limit(1);
  if (!error) return true;
  if (faceColumnsMissing(error)) return false;
  databaseError(error);
}

export type Profile = { embedding: number[] | null; model_version: string | null; photo_key: string | null; status: FaceStatus };
async function profileOf(employeeId: string): Promise<Profile | null> {
  const { data, error } = await createPrivilegedClient().from("pw_face_profiles").select("embedding,model_version,photo_key,status").eq("employee_id", employeeId).maybeSingle();
  if (error) {
    // WG People's tables are not there yet: nobody has a face to compare with.
    if (["42P01", "PGRST205"].includes(error.code ?? "")) return null;
    databaseError(error);
  }
  return (data as Profile | null) ?? null;
}
export const comparable = (profile: Profile | null): profile is Profile & { embedding: number[] } =>
  !!profile && usableFace(profile.status) && profile.model_version === FACE_MODEL_VERSION && isEmbedding(profile.embedding);

const NO_FACE = "Wajahmu belum terdaftar di WG People, jadi belum bisa dicocokkan. Absen dengan scan QR di ruang, atau daftarkan wajah di WG People dulu.";

/** Step one, when the camera opens. */
export async function startFaceCheckIn(sessionId: string, member: Member, now = new Date()): Promise<FaceStartAnswer> {
  const gate = await selfCheckInGate(sessionId, member, now, "wajah");
  if (gate.result.kind === "sudah") return { kind: "sudah", checkedInAt: gate.result.checkedInAt, method: gate.method };
  refuse(gate.result);
  if (!isR2Configured()) throw storageNotReady();
  if (!(await faceReady())) throw faceWaiting();
  const profile = await profileOf(member.id);
  if (!comparable(profile)) return { kind: "tanpa-wajah", message: NO_FACE };
  const referenceUrl = profile.photo_key ? await presignDownload(profile.photo_key, { seconds: REFERENCE_VIEW_SECONDS }).catch(() => null) : null;
  return { kind: "mulai", ...newFaceToken(sessionId, member, now), needsConsent: profile.status === "siap", referenceUrl };
}

/** Step two: where the photo goes, for this nonce only. */
export async function startFacePhoto(sessionId: string, member: Member, input: FaceUpload, now = new Date()): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw storageNotReady();
  const { nonce, expires } = readFaceToken(input.token, sessionId, member, now);
  const key = proofKeyFor(sessionId, member.id, randomUUID(), input.mime);
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${uploadSignature(key, input.mime, input.size, sessionId, member, nonce, expires)}` };
}

/** Step three: judge the face again and write the one row. */
export async function submitFaceCheckIn(sessionId: string, member: Member, input: FaceCheckIn, now = new Date()): Promise<FaceCheckInAnswer> {
  const { nonce, expires } = readFaceToken(input.token, sessionId, member, now);
  const photo = input.photo;
  const [expiresText, given] = photo.token.split(".");
  if (!isOwnProofKey(photo.key, sessionId, member.id, photo.mime) || Number(expiresText) !== expires || !/^[0-9a-f]{64}$/.test(given ?? "")
    || !same(given, uploadSignature(photo.key, photo.mime, photo.size, sessionId, member, nonce, expires))) throw unknownUpload();
  if (!isR2Configured()) throw storageNotReady();
  let keep = false;
  try {
    if (!framesLookReal(input.signals) || !sameFace(input.frameEmbeddings)) throw new ServiceError(422, "Foto wajah belum jelas. Lihat lurus ke kamera, lalu ambil ulang.");
    if (cosine(input.embedding, average(input.frameEmbeddings)) < 0.98) throw new ServiceError(422, "Data wajah tidak lengkap. Ulangi dari awal.");

    const gate = await selfCheckInGate(sessionId, member, now, "wajah");
    if (gate.result.kind === "sudah") return { kind: "sudah", checkedInAt: gate.result.checkedInAt, method: gate.method, percent: null };
    refuse(gate.result);
    const profile = await profileOf(member.id);
    if (!comparable(profile)) throw new ServiceError(409, NO_FACE);
    if (profile.status === "siap" && input.consent !== CONSENT_VERSION) throw new ServiceError(409, "Setujui pemakaian data wajah dulu.");

    const score = cosine(input.embedding, profile.embedding);
    const verdict = faceVerdict(score);
    const percent = matchPercent(score);
    if (verdict === "tidak_cocok") return { kind: "tidak-cocok", percent };

    const start = await uploadedStart(photo.key, photo.size).catch(() => { throw new ServiceError(422, "Foto belum sampai di penyimpanan. Ambil ulang."); });
    if (!photoMagicMatches(photo.mime, start)) throw new ServiceError(422, "Isi berkas bukan gambar WebP atau JPEG. Ambil ulang.");

    const client = createPrivilegedClient();
    const status = verdict === "cocok" ? "cocok" : "perlu_cek";
    const at = now.toISOString();
    const { data, error } = await client.from("pw_attendance")
      .upsert({ session_id: sessionId, employee_id: member.id, method: "wajah", proof_key: photo.key, face_score: score, face_status: status, checked_in_at: at }, { onConflict: "session_id,employee_id", ignoreDuplicates: true })
      .select("checked_in_at");
    if (error) { if (faceColumnsMissing(error) || error.code === "23514") throw faceWaiting(); databaseError(error); }
    if (profile.status === "siap") {
      // The first use of an imported GreatDay face: the person agreed here, as in WG People.
      await client.from("pw_face_profiles").update({ status: "aktif", consent_at: at, consent_version: CONSENT_VERSION, updated_at: at }).eq("employee_id", member.id).eq("status", "siap");
    }
    if (data?.length) { keep = true; return { kind: "tercatat", checkedInAt: data[0].checked_in_at, method: "wajah", percent, status }; }
    // A scan or panitia signed them in a moment ago.
    const { data: existing } = await client.from("pw_attendance").select("checked_in_at,method").eq("session_id", sessionId).eq("employee_id", member.id).maybeSingle();
    return { kind: "sudah", checkedInAt: existing?.checked_in_at ?? at, method: asMethod(existing?.method), percent };
  } finally {
    if (!keep) await removeObjects([photo.key]).catch(() => undefined);
  }
}
