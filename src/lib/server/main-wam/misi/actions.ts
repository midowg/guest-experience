import "server-only";
import { judgePosition, type LatLng, type PositionAnswer, type PositionRefusal, type PositionVerdict } from "@/lib/main-wam/misi/geo";
import { availabilityOf } from "@/lib/main-wam/misi/missions";
import { COMPLETION_COLUMNS, completionFromRow } from "@/lib/main-wam/misi/rows";
import { isSampleMission } from "@/lib/main-wam/misi/sample";
import type { PhotoConfirmInput, PhotoStartInput, PositionInput } from "@/lib/main-wam/misi/schema";
import { MISSIONS_MIGRATION, type MissionKind, type MissionSettings, type MwCompletion, type MwMission } from "@/lib/main-wam/misi/types";
import { DEMO_WRITE_MESSAGE } from "@/lib/main-wam/demo";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { limitPerson } from "../modul/rate";
import { allMissions, missionSettings } from "./read";
import { checkProofUploaded, keepProof, proofIdFor, proofToken, proofTokenMatches, proofUploadAddresses, removeProofFiles, removeProofUploads } from "./storage";

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

export type MissionTarget = { mission: MwMission; settings: MissionSettings; radiusM: number; target: LatLng | null; existing: MwCompletion | null };

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
  const { data, error } = await db().from("mw_mission_completions").select(COMPLETION_COLUMNS).eq("mission_id", missionId).eq("employee_id", context.viewer.id).maybeSingle();
  if (error) mwFail(error as DbError, MISSIONS_MIGRATION);
  const existing = data ? completionFromRow(data) : null;
  if (existing?.status === "disetujui") throw refuse(409, "Misi ini sudah selesai.");
  if (existing?.status === "menunggu") throw refuse(409, "Kirimanmu sedang ditinjau.");
  const target = mission.latitude !== null && mission.longitude !== null ? { latitude: mission.latitude, longitude: mission.longitude } : null;
  return { mission, settings, radiusM: mission.radiusM ?? settings.defaultRadiusM, target, existing };
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
    inside: verdict.ok, reason: verdict.ok ? null : verdict.reason, distanceM: verdict.distanceM, radiusM: found.radiusM, accuracyM: Math.round(position.accuracy), hasPlace: !!found.target,
  };
}

/** Writes the completion: new, or over a rejected one (sent again). */
async function keepCompletion(context: MainWamContext, found: MissionTarget, row: Record<string, unknown>): Promise<MwCompletion> {
  const status = found.mission.review ? "menunggu" : "disetujui";
  const now = new Date().toISOString();
  const base = { ...row, status, reviewed_by: null, reviewed_at: null, review_note: "", updated_at: now };
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

export type PhotoStart = { id: string; token: string; uploads: { besar: string; kecil: string } };

/** Photo mission, step one: the position is judged now, so nobody uploads for nothing. */
export async function startPhoto(context: MainWamContext, missionId: string, input: PhotoStartInput, now = new Date()): Promise<PhotoStart> {
  await limitPerson("misi-foto", context.viewer.id, 20);
  const found = await doableMission(context, missionId, "foto", now);
  mustBeThere(found, input.position, now);
  const id = proofIdFor(context.viewer.id, missionId, input.clientId);
  const uploads = await proofUploadAddresses(id, { size: input.size, thumbSize: input.thumbSize });
  return { id, token: proofToken({ id, size: input.size, thumbSize: input.thumbSize, width: input.width, height: input.height }, now.getTime()), uploads };
}

/** Photo mission, step two: the token, the position again, the files, then the proof is kept. */
export async function confirmPhoto(context: MainWamContext, missionId: string, input: PhotoConfirmInput, now = new Date()): Promise<MwCompletion> {
  await limitPerson("misi-foto", context.viewer.id, 20);
  const found = await doableMission(context, missionId, "foto", now);
  const id = proofIdFor(context.viewer.id, missionId, input.clientId);
  const agreed = { id, size: input.size, thumbSize: input.thumbSize, width: input.width, height: input.height };
  if (!proofTokenMatches(input.token, agreed, now.getTime())) throw refuse(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const { distanceM } = mustBeThere(found, input.position, now);
  await checkProofUploaded(id, { size: input.size, thumbSize: input.thumbSize });
  const keys = await keepProof(id);
  try {
    const completion = await keepCompletion(context, found, { source: "foto", ...positionColumns(input.position, distanceM, now), proof_key: keys.besar, proof_thumb_key: keys.kecil });
    await removeProofUploads(id);
    return completion;
  } catch (error) {
    // A 409 means the first confirmation of this same photo won the race and its files are the kept ones: leave them.
    if (!(error instanceof ServiceError && error.status === 409)) await removeProofFiles(id);
    throw error;
  }
}
