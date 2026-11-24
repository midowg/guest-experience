import "server-only";
import { rankOrder } from "@/lib/main-wam/misi/rank";
import { REVIEW_STATUSES } from "@/lib/main-wam/misi/verify";
import { COMPLETION_COLUMNS, COMPLETION_COLUMNS_BASE, completionFromRow, ENTRY_COLUMNS, entryFromRow, MISSION_COLUMNS_BASE, missionFromRow, settingsFromRow } from "@/lib/main-wam/misi/rows";
import { missionRow, type MissionInput, type ReviewInput, type SettingsInput } from "@/lib/main-wam/misi/schema";
import type { CompletionSource, CompletionStatus, MissionKind, MissionSettings, MwMission } from "@/lib/main-wam/misi/types";
import type { MwSession } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { adminActor, adminFail, adminPeople } from "../admin/common";
import { mwMissing } from "../errors";
import { mainWamAttendees, mainWamPeople } from "../people";
import { allSessionsReal } from "../read";
import type { ReviewItem } from "@/lib/main-wam/misi/review-view";
import { allMissions, missionSettings, pointTotals } from "./read";
import { decideReview, listReviewQueue } from "./review";
import { proofAddress, removeProofFiles } from "./storage";

/*
 * Admin WAM → Main WAM → Misi. Every caller has passed requireAdminPage / requireApiAdmin. Admins see
 * full names (aturan-wam §4). Reads here never use the sample: what is saved is what is shown.
 */

const db = () => createPrivilegedClient();
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const REFUSALS = { duplicate: "Orang ini sudah punya penyelesaian untuk misi tersebut.", inUse: "Orang atau misi tidak dikenali. Muat ulang halaman.", invalid: "Isian belum sesuai aturan. Periksa lagi lalu simpan." };

export type AdminMissionRow = MwMission & { done: number; pending: number; rejected: number };
export type AdminCompletion = {
  id: string; missionId: string; missionTitle: string; missionKind: MissionKind; employeeId: string; person: string; department: string;
  source: CompletionSource; status: CompletionStatus; hasProof: boolean; distanceM: number | null; accuracyM: number | null; takenAt: string | null;
  note: string; reviewNote: string; reviewedBy: string | null; createdAt: string;
};
export type AdminLeader = { rank: number; employeeId: string; fullName: string; department: string; points: number; missions: number };
export type AdminPointEntry = { id: string; employeeId: string; person: string; points: number; note: string; createdBy: string | null; createdAt: string };
export type AdminMisi = {
  migrated: boolean;
  settings: MissionSettings;
  missions: AdminMissionRow[];
  completions: AdminCompletion[];
  /** The proofs waiting for a person (Tinjauan). */
  reviewQueue: ReviewItem[];
  leaderboard: AdminLeader[];
  manual: AdminPointEntry[];
  sessions: Pick<MwSession, "id" | "title" | "startsAt" | "status">[];
  people: { id: string; fullName: string; department: string }[];
};

/** Everything the Misi page of Admin WAM needs, in one round of reads. */
export async function adminMisi(): Promise<AdminMisi> {
  const [missions, settings, totals, sessions, people, attendees] = await Promise.all([
    allMissions(), missionSettings(), pointTotals(), allSessionsReal(), mainWamPeople(), mainWamAttendees(),
  ]);
  const empty: AdminMisi = { migrated: missions.migrated, settings, missions: [], completions: [], reviewQueue: [], leaderboard: [], manual: [], sessions: [], people: [] };
  if (!missions.migrated) return empty;
  const readCompletions = (columns: string) => db().from("mw_mission_completions").select(columns).order("created_at", { ascending: false }).limit(1000);
  const [completionRows, entryRows, reviewQueue] = await Promise.all([
    readCompletions(COMPLETION_COLUMNS).then(async first => (first.error && mwMissing(first.error) ? readCompletions(COMPLETION_COLUMNS_BASE) : first)),
    db().from("mw_point_entries").select(ENTRY_COLUMNS).eq("kind", "manual").order("created_at", { ascending: false }).limit(100),
    listReviewQueue(),
  ]);
  if (completionRows.error) adminFail(completionRows.error, REFUSALS);
  if (entryRows.error) adminFail(entryRows.error, REFUSALS);
  const completions = ((completionRows.data ?? []) as unknown as Record<string, unknown>[]).map(row => completionFromRow(row));
  const titles = new Map(missions.data.map(mission => [mission.id, mission]));
  const named = (id: string | null) => (id ? people.get(id)?.fullName ?? "Karyawan (tidak aktif)" : null);
  const counts = new Map<string, { done: number; pending: number; rejected: number }>();
  for (const completion of completions) {
    const count = counts.get(completion.missionId) ?? { done: 0, pending: 0, rejected: 0 };
    if (completion.status === "disetujui") count.done++; else if (completion.status === "ditolak") count.rejected++; else count.pending++;
    counts.set(completion.missionId, count);
  }
  const waitingFirst = [...completions].sort((a, b) => Number(REVIEW_STATUSES.includes(b.status)) - Number(REVIEW_STATUSES.includes(a.status)) || b.createdAt.localeCompare(a.createdAt)).slice(0, 300);
  return {
    migrated: true, settings,
    missions: missions.data.map(mission => ({ ...mission, ...(counts.get(mission.id) ?? { done: 0, pending: 0, rejected: 0 }) })),
    reviewQueue,
    completions: waitingFirst.map(completion => ({
      id: completion.id, missionId: completion.missionId, missionTitle: titles.get(completion.missionId)?.title ?? "Misi", missionKind: titles.get(completion.missionId)?.kind ?? "foto",
      employeeId: completion.employeeId, person: named(completion.employeeId) ?? "Karyawan", department: people.get(completion.employeeId)?.department ?? "",
      source: completion.source, status: completion.status, hasProof: completion.hasProof, distanceM: completion.distanceM, accuracyM: completion.accuracyM, takenAt: completion.takenAt,
      note: completion.note, reviewNote: completion.reviewNote, reviewedBy: named(completion.reviewedBy), createdAt: completion.createdAt,
    })),
    leaderboard: rankOrder(attendees.flatMap(id => {
      const person = people.get(id);
      return person ? [{ id, name: person.fullName, department: person.department, points: totals.data.get(id)?.points ?? 0, missions: totals.data.get(id)?.missions ?? 0 }] : [];
    })).map(person => ({ rank: person.rank, employeeId: person.id, fullName: person.name, department: person.department, points: person.points, missions: person.missions })),
    manual: (entryRows.data ?? []).map(row => entryFromRow(row)).map(entry => ({
      id: entry.id, employeeId: entry.employeeId, person: named(entry.employeeId) ?? "Karyawan", points: entry.points, note: entry.note, createdBy: named(entry.createdBy), createdAt: entry.createdAt,
    })),
    sessions: sessions.data.filter(session => session.status !== "batal").map(({ id, title, startsAt, status }) => ({ id, title, startsAt, status })),
    people: (await adminPeople()).map(({ id, fullName, department }) => ({ id, fullName, department })),
  };
}

async function missionById(id: string): Promise<MwMission> {
  if (!isId(id)) throw new ServiceError(404, "Misi tidak ditemukan.");
  const { data, error } = await db().from("mw_missions").select(MISSION_COLUMNS_BASE).eq("id", id).maybeSingle();
  if (error) adminFail(error, REFUSALS);
  if (!data) throw new ServiceError(404, "Misi tidak ditemukan.");
  return missionFromRow(data);
}

export async function createMission(input: MissionInput): Promise<MwMission> {
  const { data, error } = await db().from("mw_missions").insert(missionRow(input)).select(MISSION_COLUMNS_BASE).single();
  if (error) adminFail(error, REFUSALS);
  return missionFromRow({ ...data, auto_detect: input.kind === "foto" ? input.autoDetect : null });
}

export async function updateMission(id: string, input: MissionInput): Promise<MwMission> {
  await missionById(id);
  const { data, error } = await db().from("mw_missions").update(missionRow(input)).eq("id", id).select(MISSION_COLUMNS_BASE).single();
  if (error) adminFail(error, REFUSALS);
  // Back to "by default": a null is written apart, so a mission still saves before migration 202611300003.
  if (!input.autoDetect) { const reset = await db().from("mw_missions").update({ auto_detect: null }).eq("id", id); if (reset.error && !mwMissing(reset.error)) adminFail(reset.error, REFUSALS); }
  return missionFromRow({ ...data, auto_detect: input.kind === "foto" ? input.autoDetect : null });
}

/** A mission nobody has done: deleting one that has completions would take their points with it, so it is only turned off. */
export async function deleteMission(id: string): Promise<void> {
  await missionById(id);
  const { count, error } = await db().from("mw_mission_completions").select("id", { count: "exact", head: true }).eq("mission_id", id);
  if (error) adminFail(error, REFUSALS);
  if ((count ?? 0) > 0) throw new ServiceError(409, "Misi ini sudah punya penyelesaian. Matikan saja (Aktif), jangan dihapus, supaya poin peserta tetap.");
  const removed = await db().from("mw_missions").delete().eq("id", id);
  if (removed.error) adminFail(removed.error, REFUSALS);
}

export async function saveMissionSettings(input: SettingsInput): Promise<MissionSettings> {
  const { data, error } = await db().from("mw_mission_settings").upsert({ id: true, default_radius_m: input.defaultRadiusM, max_accuracy_m: input.maxAccuracyM, leaderboard_open: input.leaderboardOpen, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("default_radius_m,max_accuracy_m,leaderboard_open").single();
  if (error) adminFail(error, REFUSALS);
  return settingsFromRow(data);
}

/** Approve or reject a proof (also one that was approved by itself: rejecting takes the points back). The shared decision, review.ts. */
export async function reviewCompletion(id: string, input: ReviewInput): Promise<void> {
  const actor = await adminActor();
  await decideReview(id, actor.employeeId, input);
}

/** Panitia's hand: a person did a mission (a sesi mission, or any other with a note); approved at once. */
export async function grantCompletion(missionId: string, employeeId: string, note: string): Promise<void> {
  const mission = await missionById(missionId);
  const actor = await adminActor();
  const row = { status: "disetujui", source: "panitia", note, reviewed_by: actor.employeeId, reviewed_at: new Date().toISOString(), review_note: "", updated_at: new Date().toISOString() };
  const found = await db().from("mw_mission_completions").select("id,status").eq("mission_id", mission.id).eq("employee_id", employeeId).maybeSingle();
  if (found.error) adminFail(found.error, REFUSALS);
  if (found.data?.status === "disetujui") throw new ServiceError(409, "Orang ini sudah punya poin dari misi tersebut.");
  const saved = found.data
    ? await db().from("mw_mission_completions").update(row).eq("id", found.data.id as string)
    : await db().from("mw_mission_completions").insert({ ...row, mission_id: mission.id, employee_id: employeeId });
  if (saved.error) adminFail(saved.error, REFUSALS);
}

/** Take a completion back entirely (its points go with it, through the ledger's foreign key); its photo is removed. */
export async function deleteCompletion(id: string): Promise<void> {
  if (!isId(id)) throw new ServiceError(404, "Penyelesaian tidak ditemukan.");
  const found = await db().from("mw_mission_completions").select("id,proof_key,proof_thumb_key").eq("id", id).maybeSingle();
  if (found.error) adminFail(found.error, REFUSALS);
  if (!found.data) throw new ServiceError(404, "Penyelesaian tidak ditemukan. Muat ulang halaman.");
  const removed = await db().from("mw_mission_completions").delete().eq("id", id);
  if (removed.error) adminFail(removed.error, REFUSALS);
  await removeProofFiles(id, [found.data.proof_key as string | null, found.data.proof_thumb_key as string | null]);
}

/** Points by hand: a bonus or a correction, with its reason; a row in the ledger like the others. */
export async function addManualPoints(employeeId: string, points: number, note: string): Promise<void> {
  const actor = await adminActor();
  const { error } = await db().from("mw_point_entries").insert({ employee_id: employeeId, points, kind: "manual", note, created_by: actor.employeeId });
  if (error) adminFail(error, REFUSALS);
}

export async function deleteManualEntry(id: string): Promise<void> {
  if (!isId(id)) throw new ServiceError(404, "Catatan poin tidak ditemukan.");
  const { data, error } = await db().from("mw_point_entries").delete().eq("id", id).eq("kind", "manual").select("id").maybeSingle();
  if (error) adminFail(error, REFUSALS);
  if (!data) throw new ServiceError(404, "Catatan poin tidak ditemukan. Muat ulang halaman.");
}

/** A proof photo's short-lived address for Admin WAM, or null (no photo, no storage). */
export async function proofRedirect(completionId: string): Promise<string | null> {
  if (!isId(completionId)) return null;
  const { data, error } = await db().from("mw_mission_completions").select("proof_key,photo_id").eq("id", completionId).maybeSingle();
  if (error) {
    if (!mwMissing(error)) adminFail(error, REFUSALS);
    // Before migration 202611300001 there is no photo link: the proof's own file only.
    const older = await db().from("mw_mission_completions").select("proof_key").eq("id", completionId).maybeSingle();
    return proofAddress((older.data?.proof_key as string | null | undefined) ?? null);
  }
  const proof = (data?.proof_key as string | null | undefined) ?? null;
  if (proof) return proofAddress(proof);
  // A regular Momen photo that was recognised as meeting the mission has no proof file of its own: its Momen photo is the proof.
  const photoId = (data?.photo_id as string | null | undefined) ?? null;
  if (!photoId) return null;
  const photo = await db().from("mw_photos").select("file_key").eq("id", photoId).maybeSingle();
  return proofAddress((photo.data?.file_key as string | null | undefined) ?? null);
}

