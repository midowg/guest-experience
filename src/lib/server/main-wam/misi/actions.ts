import "server-only";
import { judgePosition, type LatLng, type PositionAnswer, type PositionRefusal, type PositionVerdict } from "@/lib/main-wam/misi/geo";
import { checkRules, effectiveRules, timesOf, type MissionRule, type TagCandidate } from "@/lib/main-wam/misi/rules";
import { availabilityOf } from "@/lib/main-wam/misi/missions";
import { COMPLETION_COLUMNS, COMPLETION_COLUMNS_BASE, completionFromRow } from "@/lib/main-wam/misi/rows";
import { isSampleMission } from "@/lib/main-wam/misi/sample";
import type { PhotoConfirmInput, PhotoStartInput, PositionInput } from "@/lib/main-wam/misi/schema";
import { canResend, decide, reasonLine, type CheckResult } from "@/lib/main-wam/misi/verify";
import { MISSIONS_MIGRATION, type MissionKind, type MissionSettings, type MwCompletion, type MwMission } from "@/lib/main-wam/misi/types";
import { DEMO_WRITE_MESSAGE } from "@/lib/main-wam/demo";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { limitPerson } from "../modul/rate";
import { allMissions, missionSettings } from "./read";
import { createMissionPhoto } from "../momen/mission-photo";
import { checkProofUploaded, keepProof, proofAddress, proofIdFor, proofToken, proofTokenMatches, proofUploadAddresses, removeProofFiles, removeProofKeys, removeProofUploads } from "./storage";
import { afterApproval } from "./review";
import { loadTagPool, resolveTags, savePhotoTags } from "./tags";
import { runVerifier } from "./verifier";

/*
 * Doing a mission (check-in and photo): the server finds the mission, checks that it is open and not
 * done yet, judges the position the phone sent (never trusting the browser), and keeps the proof. An
 * approved completion gives its points through the database (trigger mw_completion_points); a mission
 * that asks for review keeps the completion "menunggu" until an admin approves it.
 */

const db = () => createPrivilegedClient();
const refuse = (status: number, message: string) => new ServiceError(status, message);

/** The words of why a position was refused (exact texts: translated on the phone by translateKnown). */
const REFUSALS: Record<PositionRefusal, string> = {
  "tidak-valid": "Lokasi belum terbaca. Aktifkan lokasi lalu coba lagi.",
  kedaluwarsa: "Lokasi sudah lama. Cek lokasi lagi.",
  "tidak-akurat": "Lokasi kurang teliti. Coba di tempat terbuka.",
  "terlalu-jauh": "Kamu belum berada di area misi.",
};

export type MissionTarget = { mission: MwMission; settings: MissionSettings; radiusM: number; target: LatLng | null; existing: MwCompletion | null; oldProof: string[] };

/** The mission a person may do now: it exists, is active, is of this kind, is open, and is not done or waiting. */
export async function doableMission(context: MainWamContext, missionId: string, kind: MissionKind, now: Date): Promise<MissionTarget> {
  if (isSampleMission(missionId)) throw refuse(403, DEMO_WRITE_MESSAGE);
  const missions = await allMissions();
  if (!missions.migrated) throw refuse(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  const mission = missions.data.find(item => item.id === missionId && item.active);
  if (!mission) throw refuse(404, "Misi tidak ditemukan.");
  if (mission.kind !== kind) throw refuse(409, "Misi ini dikerjakan dengan cara lain.");
  const availability = availabilityOf(mission, now);
  if (availability === "belum") throw refuse(409, "Misi ini belum dibuka.");
  if (availability === "tutup") throw refuse(409, "Misi ini sudah ditutup.");
  const settings = await missionSettings();
  const read = (columns: string) => db().from("mw_mission_completions").select(columns).eq("mission_id", missionId).eq("employee_id", context.viewer.id).maybeSingle();
  let { data, error } = await read(COMPLETION_COLUMNS);
  // Before migration 202611300001 the newer columns are not there: the older ones tell enough to refuse a repeat.
  if (error && mwMissing(error as DbError)) ({ data, error } = await read(COMPLETION_COLUMNS_BASE));
  if (error) mwFail(error as DbError, MISSIONS_MIGRATION);
  const row = data as unknown as Record<string, unknown> | null;
  const existing = row ? completionFromRow(row) : null;
  if (existing?.status === "disetujui") throw refuse(409, "Misi ini sudah selesai.");
  if (existing && existing.status !== "ditolak") throw refuse(409, "Kirimanmu sedang ditinjau.");
  if (existing && !canResend("ditolak", existing.attempts, timesOf(effectiveRules(mission, settings.defaultRadiusM)))) throw refuse(409, "Batas kirim misi ini sudah tercapai.");
  const target = mission.latitude !== null && mission.longitude !== null ? { latitude: mission.latitude, longitude: mission.longitude } : null;
  // The kept files of an earlier, rejected proof: a new proof replaces them, so they are removed then.
  const oldProof = [row?.proof_key, row?.proof_thumb_key, typeof row?.proof_key === "string" ? row.proof_key.replace(/\.jpg$/, "-ubin.jpg") : null].filter((key): key is string => typeof key === "string" && !!key);
  return { mission, settings, radiusM: mission.radiusM ?? settings.defaultRadiusM, target, existing, oldProof };
}

const fixOf = (position: PositionInput) => ({ latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy, at: position.at ?? null });

/** The verdict on a position for this mission (no write): the screen's live "inside the area". */
export function judge(found: MissionTarget, position: PositionInput, now: Date): PositionVerdict {
  return judgePosition({ fix: fixOf(position), target: found.target, radiusM: found.radiusM, maxAccuracyM: found.settings.maxAccuracyM, now });
}

/** A position that does not pass is refused with its reason in words. */
function mustBeThere(found: MissionTarget, position: PositionInput, now: Date): { distanceM: number | null } {
  const verdict = judge(found, position, now);
  if (!verdict.ok) throw refuse(422, REFUSALS[verdict.reason]);
  return { distanceM: verdict.distanceM };
}

/** POST …/cek: where the person stands against the mission's area. Nothing is saved. */
export async function checkPosition(context: MainWamContext, missionId: string, kind: MissionKind, position: PositionInput, now = new Date()): Promise<PositionAnswer> {
  await limitPerson("misi-cek", context.viewer.id, 60);
  const found = await doableMission(context, missionId, kind, now);
  const verdict = judge(found, position, now);
  return {
    inside: verdict.ok, reason: verdict.ok ? null : verdict.reason, radiusM: found.radiusM, accuracyM: Math.round(position.accuracy), hasPlace: !!found.target,
  };
}

/** Writes the completion: new, or over a rejected one (sent again). */
async function keepCompletion(context: MainWamContext, found: MissionTarget, row: Record<string, unknown>, status: string = found.mission.review ? "menunggu" : "disetujui"): Promise<MwCompletion> {
  const now = new Date().toISOString();
  const base = { review_note: "", ...row, status, reviewed_by: null, reviewed_at: null, updated_at: now };
  const query = found.existing
    ? db().from("mw_mission_completions").update(base).eq("id", found.existing.id).eq("status", "ditolak")
    : db().from("mw_mission_completions").insert({ ...base, mission_id: found.mission.id, employee_id: context.viewer.id });
  const { data, error } = await query.select(COMPLETION_COLUMNS).maybeSingle();
  if (error) {
    // Two taps at once: the first one kept it.
    if (error.code === "23505") throw refuse(409, "Misi ini sudah selesai.");
    mwFail(error as DbError, MISSIONS_MIGRATION);
  }
  if (!data) throw refuse(409, "Misi ini sudah selesai.");
  return completionFromRow(data);
}

const positionColumns = (position: PositionInput, distanceM: number | null, now: Date) => ({
  latitude: position.latitude, longitude: position.longitude, accuracy_m: Math.round(position.accuracy), distance_m: distanceM, taken_at: now.toISOString(),
});

/** A check-in mission: judged here, then done. */
export async function checkIn(context: MainWamContext, missionId: string, position: PositionInput, now = new Date()): Promise<MwCompletion> {
  await limitPerson("misi-checkin", context.viewer.id, 20);
  const found = await doableMission(context, missionId, "checkin", now);
  const { distanceM } = mustBeThere(found, position, now);
  return keepCompletion(context, found, { source: "lokasi", ...positionColumns(position, distanceM, now), proof_key: null, proof_thumb_key: null });
}

/** Does the completion that is there now point at these files? When it cannot be read, the files stay (an orphan costs less than a lost proof). */
async function winnerKeeps(context: MainWamContext, missionId: string, keys: { besar: string; kecil: string }): Promise<boolean> {
  const { data, error } = await db().from("mw_mission_completions").select("proof_key,proof_thumb_key").eq("mission_id", missionId).eq("employee_id", context.viewer.id).maybeSingle();
  if (error || !data) return true;
  return data.proof_key === keys.besar || data.proof_thumb_key === keys.kecil;
}

export type PhotoStart = { id: string; token: string; uploads: { besar: string; kecil: string; ubin: string } };

/** Photo mission, step one: the position is judged now, so nobody uploads for nothing; the tagged people must be participants. */
export async function startPhoto(context: MainWamContext, missionId: string, input: PhotoStartInput, now = new Date()): Promise<PhotoStart> {
  await limitPerson("misi-foto", context.viewer.id, 20);
  const found = await doableMission(context, missionId, "foto", now);
  mustBeThere(found, input.position, now);
  if (input.tags.length) resolveTags(await loadTagPool(context), input.tags);
  const id = proofIdFor(context.viewer.id, missionId, input.clientId);
  const sizes = { size: input.size, thumbSize: input.thumbSize, tileSize: input.tileSize };
  const uploads = await proofUploadAddresses(id, sizes);
  return { id, token: proofToken({ id, ...sizes, width: input.width, height: input.height }, now.getTime()), uploads };
}

export type PhotoOutcome = { completion: MwCompletion; status: MwCompletion["status"]; reasons: string[] };

/**
 * Photo mission, step two. The token, the position again, the files, the tags; then the road of a proof:
 * the rules the server can check alone (place, tags, hours, tries), and only when they hold, the verifier.
 * A broken rule is a rejection with its reasons ("ditolak", the person may send again while the limit
 * allows); the verifier's doubt is "perlu_ditinjau" (the queue of Tinjauan); only "lolos" approves, and
 * only an approved proof gives points (the database's trigger). A proof that is not rejected also becomes
 * a Momen photo with its tags.
 */
export async function confirmPhoto(context: MainWamContext, missionId: string, input: PhotoConfirmInput, now = new Date()): Promise<PhotoOutcome> {
  await limitPerson("misi-foto", context.viewer.id, 20);
  const found = await doableMission(context, missionId, "foto", now);
  const id = proofIdFor(context.viewer.id, missionId, input.clientId);
  const sizes = { size: input.size, thumbSize: input.thumbSize, tileSize: input.tileSize };
  const agreed = { id, ...sizes, width: input.width, height: input.height };
  if (!proofTokenMatches(input.token, agreed, now.getTime())) throw refuse(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const { distanceM } = mustBeThere(found, input.position, now);
  const rules = effectiveRules(found.mission, found.settings.defaultRadiusM);
  const tags = input.tags.length ? resolveTags(await loadTagPool(context), input.tags) : [];
  const check = checkRules(rules, {
    now, inside: found.target ? true : null, tags, submitter: { id: context.viewer.id, department: context.viewer.department },
    previous: found.existing?.attempts ?? 0, live: true,
  });
  await checkProofUploaded(id, sizes);
  const keys = await keepProof(id);
  try {
    const { status, reasons, result } = await verdictOf(found, rules, check, tags, keys.besar, input, distanceM, now);
    const completion = await keepCompletion(context, found, {
      source: "foto", ...positionColumns(input.position, distanceM, now), proof_key: keys.besar, proof_thumb_key: keys.kecil,
      attempts: (found.existing?.attempts ?? 0) + 1, check_result: result, review_note: status === "ditolak" ? reasonLine(reasons) : "",
    }, status);
    await removeProofUploads(id);
    // Sent again after "ditolak": the earlier proof's files are no longer anyone's.
    await removeProofKeys(found.oldProof.filter(key => key !== keys.besar && key !== keys.kecil && key !== keys.ubin));
    if (status !== "ditolak") await linkToMomen(context, found.mission, completion, keys, input, tags, now);
    return { completion, status, reasons };
  } catch (error) {
    // A 409 may mean the first confirmation of this same photo won the race (its files are the kept ones:
    // leave them), or that another photo of this person won (ours are orphans: remove them).
    if (!(error instanceof ServiceError && error.status === 409) || !(await winnerKeeps(context, found.mission.id, keys))) await removeProofFiles(id);
    throw error;
  }
}

/** The end of the road for one proof: broken rules reject; else the verifier is asked. */
async function verdictOf(found: MissionTarget, rules: MissionRule[], check: ReturnType<typeof checkRules>, tags: TagCandidate[], key: string, input: PhotoConfirmInput, distanceM: number | null, now: Date) {
  let verifier: CheckResult["verifier"] = null;
  if (check.ok) {
    verifier = await runVerifier({
      misi: { id: found.mission.id, title: found.mission.title, description: found.mission.description }, aturan: rules,
      foto: { key, address: () => proofAddress(key) },
      lokasi: { latitude: input.position.latitude, longitude: input.position.longitude, accuracyM: Math.round(input.position.accuracy), distanceM },
      tag: tags.map(tag => ({ id: tag.id, name: tag.name, department: tag.department, bod: tag.bod })), waktu: now.toISOString(),
    });
  }
  const decision = decide({ ruleReasons: check.reasons, verifier: verifier?.result ?? null, review: found.mission.review });
  return { ...decision, result: { checks: check.checks, verifier, decidedAt: now.toISOString() } satisfies CheckResult };
}

/**
 * The proof becomes a Momen photo (stack and Mozaik) with the people tagged; approved at once means shown
 * and the tagged told now, otherwise it waits and approval (review.ts afterApproval) does both. Momen's own
 * trouble never undoes the proof: the completion stays, without a photo link, and the error is logged.
 */
async function linkToMomen(context: MainWamContext, mission: MwMission, completion: MwCompletion, keys: { besar: string; kecil: string; ubin: string }, input: PhotoConfirmInput, tags: TagCandidate[], now: Date) {
  try {
    const photoId = await createMissionPhoto({
      ownerId: context.viewer.id, clientId: input.clientId, proof: keys, size: input.size, width: input.width, height: input.height,
      takenAt: now.toISOString(), missionId: mission.id, approved: completion.status === "disetujui",
    }, now);
    await savePhotoTags(photoId, context.viewer.id, tags);
    const { error } = await db().from("mw_mission_completions").update({ photo_id: photoId }).eq("id", completion.id);
    if (error) throw error;
    if (completion.status === "disetujui") await afterApproval({ ...completion, photoId }, mission.title, context.viewer.name);
  } catch (error) {
    console.warn("main-wam: bukti misi belum menjadi foto Momen", error instanceof Error ? error.message : error);
  }
}
