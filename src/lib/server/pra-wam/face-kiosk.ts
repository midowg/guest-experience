import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { checkInWindow, isOwnProofKey, proofKeyFor, windowState } from "@/lib/pra-wam/attendance";
import { average, cosine, matchPercent, sameFace } from "@/lib/hr/face-match";
import { framesLookReal } from "@/lib/hr/liveness";
import {
  pickFace, type KioskAnswer, type KioskCandidate, type KioskIdentify, type KioskOverview, type KioskPerson, type KioskRecord, type KioskRecorded, type KioskScore,
} from "@/lib/pra-wam/face-kiosk";
import { photoMagicMatches } from "@/lib/pra-wam/photo";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import type { Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { faceColumnsMissing } from "./attendance";
import { comparable, faceReady, faceWaiting, type Profile } from "./face-check-in";
import type { Member } from "./session";
import { getSession } from "./sessions";

/*
 * Mode tablet (23 Nov 2026; see src/lib/pra-wam/face-kiosk.ts). Two calls per face:
 *   1. identify: the frames must be one face and agree with the embedding; it is scored against
 *      every participant's WG People face, and the answer names who (or offers a close call). Each
 *      person named comes with an upload slot for their photo and a signed answer (2 minutes), so
 *      the score and the person cannot be changed on the tablet;
 *   2. record: the photo is there, and one row is written as "wajah", cocok, or disahkan by the
 *      panitia who said yes on the tablet. Anything refused deletes the photo.
 * Only panitia (and admin) open it, while the session's check-in window is open.
 */

const ANSWER_SECONDS = 120;
const REFERENCE_VIEW_SECONDS = 5 * 60;
const storageNotReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Pakai scan QR dulu.");
const unknownAnswer = () => new ServiceError(403, "Absen tidak dikenali. Hadapkan wajah lagi.");
const unclear = () => new ServiceError(422, "Wajah belum terbaca jelas. Tetap menghadap kamera sebentar.");
const clock = (iso: string) => clockLabel(wibTime(iso));

function secret(): string {
  const value = praWamSecret();
  if (!value) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return value;
}
const sign = (...parts: (string | number)[]) => createHmac("sha256", secret()).update(parts.join("\0")).digest("hex");
const same = (a: string, b: string) => a.length === b.length && /^[0-9a-f]+$/.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

type Decision = { employeeId: string; score: number; status: "cocok" | "disahkan"; nonce: string; expires: number };

/** A signed answer for one person: the tablet can only send it back as it is. */
export function newKioskToken(sessionId: string, viewer: Pick<Member, "id">, decision: Decision): string {
  const payload = Buffer.from(JSON.stringify(decision)).toString("base64url");
  return `${payload}.${sign("wam-tablet", sessionId, viewer.id, payload)}`;
}
export function readKioskToken(token: string, sessionId: string, viewer: Pick<Member, "id">, now = new Date()): Decision {
  const [payload, given] = token.split(".");
  if (!payload || !given || !same(given, sign("wam-tablet", sessionId, viewer.id, payload))) throw unknownAnswer();
  let decision: Decision;
  try { decision = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Decision; } catch { throw unknownAnswer(); }
  if (typeof decision.employeeId !== "string" || typeof decision.score !== "number" || !["cocok", "disahkan"].includes(decision.status)
    || typeof decision.nonce !== "string" || !Number.isInteger(decision.expires)) throw unknownAnswer();
  if (decision.expires * 1000 < now.getTime()) throw new ServiceError(410, "Waktu absen habis. Hadapkan wajah lagi.");
  return decision;
}
const uploadSignature = (key: string, mime: string, size: number, sessionId: string, viewer: Pick<Member, "id">, decision: Decision) =>
  sign("wam-tablet-foto", key, mime, size, sessionId, viewer.id, decision.employeeId, decision.nonce, decision.expires);

/** The session as panitia's tablet may use it now: published, needs a check-in, window open. */
async function openSession(sessionId: string, viewer: Member, now: Date): Promise<Session> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa membuka mode tablet.");
  const session = await getSession(sessionId, viewer);
  if (session.status !== "terbit" || !session.startsAt || !session.endsAt) throw new ServiceError(409, "Sesi belum terbit. Absen baru tercatat setelah sesi diterbitkan.");
  if (session.booking?.outside) throw new ServiceError(409, "Booking ini untuk keperluan di luar WAM, jadi tidak perlu absen.");
  const window = checkInWindow(session.startsAt, session.endsAt);
  const state = windowState(window, now);
  if (state === "belum") throw new ServiceError(409, `Absen belum dibuka. Dibuka ${clock(window.opens)} WIB.`);
  if (state === "tutup") throw new ServiceError(409, `Absen sudah ditutup ${clock(window.closes)} WIB.`);
  return session;
}

type FaceRow = Profile & { employee_id: string };
/** The participants' WG People faces that can be compared; none when WG People's tables are not there. */
async function facesOf(ids: string[]): Promise<(FaceRow & { embedding: number[] })[]> {
  if (!ids.length) return [];
  const { data, error } = await createPrivilegedClient().from("pw_face_profiles").select("employee_id,embedding,model_version,photo_key,status").in("employee_id", ids);
  if (error) { if (["42P01", "PGRST205"].includes(error.code ?? "")) return []; databaseError(error); }
  return ((data ?? []) as FaceRow[]).filter((row): row is FaceRow & { embedding: number[] } => comparable(row));
}
async function presentOf(sessionId: string): Promise<Map<string, string>> {
  const { data, error } = await createPrivilegedClient().from("pw_attendance").select("employee_id,checked_in_at").eq("session_id", sessionId);
  if (error) databaseError(error);
  return new Map((data ?? []).map(row => [row.employee_id as string, row.checked_in_at as string]));
}
async function presentCount(sessionId: string): Promise<number> {
  const { count, error } = await createPrivilegedClient().from("pw_attendance").select("employee_id", { count: "exact", head: true }).eq("session_id", sessionId);
  if (error) databaseError(error);
  return count ?? 0;
}

/** The tablet's page: how many take part, how many can be recognised, how many are in, and the window. */
export async function kioskOverview(sessionId: string, viewer: Member): Promise<KioskOverview> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa membuka mode tablet.");
  const session = await getSession(sessionId, viewer);
  const ids = (session.participants ?? []).map(person => person.id);
  const [faces, present] = await Promise.all([facesOf(ids), presentCount(sessionId)]);
  const window = session.startsAt && session.endsAt ? checkInWindow(session.startsAt, session.endsAt) : null;
  return { total: ids.length, withFace: faces.filter(face => face.status !== "siap").length, present, opens: window?.opens ?? null, closes: window?.closes ?? null };
}

/** Step one: who this face is among the session's participants. */
export async function identifyFace(sessionId: string, viewer: Member, input: KioskIdentify, now = new Date()): Promise<KioskAnswer> {
  if (!framesLookReal(input.signals) || !sameFace(input.frameEmbeddings)) throw unclear();
  if (cosine(input.embedding, average(input.frameEmbeddings)) < 0.98) throw unclear();
  if (!isR2Configured()) throw storageNotReady();
  const session = await openSession(sessionId, viewer, now);
  if (!(await faceReady())) throw faceWaiting();
  const people = session.participants ?? [];
  const [faces, present] = await Promise.all([facesOf(people.map(person => person.id)), presentOf(sessionId)]);
  const scores: KioskScore[] = faces.map(face => ({ employeeId: face.employee_id, score: cosine(input.embedding, face.embedding), present: present.has(face.employee_id), consented: face.status !== "siap" }));
  const pick = pickFace(scores);
  if (pick.kind === "tidak-dikenali") return pick;

  const personOf = (employeeId: string, score: number): KioskPerson => {
    const person = people.find(item => item.id === employeeId);
    return { employeeId, name: person?.name ?? "Tanpa nama", department: person?.department ?? "", percent: matchPercent(score) };
  };
  if (pick.kind === "sudah") return { kind: "sudah", person: personOf(pick.employeeId, pick.score), checkedInAt: present.get(pick.employeeId)! };
  if (pick.kind === "belum-setuju") return { kind: "belum-setuju", person: personOf(pick.employeeId, pick.score) };

  const expires = Math.floor(now.getTime() / 1000) + ANSWER_SECONDS;
  const candidateOf = async (employeeId: string, score: number, status: Decision["status"]): Promise<KioskCandidate> => {
    const decision: Decision = { employeeId, score, status, nonce: randomBytes(12).toString("base64url"), expires };
    const key = proofKeyFor(sessionId, employeeId, randomUUID(), input.mime);
    const photoKey = faces.find(face => face.employee_id === employeeId)?.photo_key;
    const [uploadUrl, referenceUrl] = await Promise.all([
      presignUpload(key, input.mime, input.size),
      // The WG People photo, only where panitia is asked to compare.
      status === "disahkan" && photoKey ? presignDownload(photoKey, { seconds: REFERENCE_VIEW_SECONDS }).catch(() => null) : Promise.resolve(null),
    ]);
    return {
      ...personOf(employeeId, score), referenceUrl, token: newKioskToken(sessionId, viewer, decision),
      upload: { key, uploadUrl, token: `${expires}.${uploadSignature(key, input.mime, input.size, sessionId, viewer, decision)}` },
    };
  };
  if (pick.kind === "cocok") return { kind: "cocok", candidate: await candidateOf(pick.employeeId, pick.score, "cocok") };
  return { kind: "konfirmasi", candidates: await Promise.all(pick.candidates.map(item => candidateOf(item.employeeId, item.score, "disahkan"))) };
}

/** Step two: the photo is there; write the one row. */
export async function recordKioskFace(sessionId: string, viewer: Member, input: KioskRecord, now = new Date()): Promise<KioskRecorded> {
  const decision = readKioskToken(input.token, sessionId, viewer, now);
  const photo = input.photo;
  const [expiresText, given] = photo.token.split(".");
  if (!isOwnProofKey(photo.key, sessionId, decision.employeeId, photo.mime) || Number(expiresText) !== decision.expires
    || !same(given ?? "", uploadSignature(photo.key, photo.mime, photo.size, sessionId, viewer, decision))) throw unknownAnswer();
  if (!isR2Configured()) throw storageNotReady();
  let keep = false;
  try {
    const session = await openSession(sessionId, viewer, now);
    const person = (session.participants ?? []).find(item => item.id === decision.employeeId);
    if (!person) throw new ServiceError(409, "Orang ini bukan peserta sesi ini.");
    const named: KioskPerson = { employeeId: person.id, name: person.name, department: person.department, percent: matchPercent(decision.score) };
    const start = await uploadedStart(photo.key, photo.size).catch(() => { throw new ServiceError(422, "Foto belum sampai di penyimpanan. Hadapkan wajah lagi."); });
    if (!photoMagicMatches(photo.mime, start)) throw new ServiceError(422, "Isi berkas bukan gambar WebP atau JPEG.");

    const client = createPrivilegedClient();
    const at = now.toISOString();
    const { data, error } = await client.from("pw_attendance").upsert({
      session_id: sessionId, employee_id: person.id, method: "wajah", proof_key: photo.key, face_score: decision.score, face_status: decision.status,
      face_checked_by: decision.status === "disahkan" ? viewer.id : null, checked_in_at: at,
    }, { onConflict: "session_id,employee_id", ignoreDuplicates: true }).select("checked_in_at");
    if (error) { if (faceColumnsMissing(error) || error.code === "23514") throw faceWaiting(); databaseError(error); }
    if (data?.length) keep = true;
    const checkedInAt = data?.[0]?.checked_in_at ?? (await presentOf(sessionId)).get(person.id) ?? at;
    return { kind: keep ? "tercatat" : "sudah", person: named, checkedInAt, present: await presentCount(sessionId) };
  } finally {
    if (!keep) await removeObjects([photo.key]).catch(() => undefined);
  }
}
