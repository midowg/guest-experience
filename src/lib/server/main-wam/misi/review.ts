import "server-only";
import { reviewRuleLines, type ReviewItem } from "@/lib/main-wam/misi/review-view";
import { COMPLETION_COLUMNS, COMPLETION_COLUMNS_BASE, completionFromRow } from "@/lib/main-wam/misi/rows";
import type { ReviewInput } from "@/lib/main-wam/misi/schema";
import { MISSIONS_MIGRATION, type MwCompletion } from "@/lib/main-wam/misi/types";
import { canMove, REVIEW_STATUSES } from "@/lib/main-wam/misi/verify";
import { mainWamAdminApi, mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, type DbError } from "../errors";
import { publishMissionPhoto, withdrawMissionPhoto } from "../momen/mission-photo";
import { trySendMainWamNote } from "../notes";
import { mainWamPeople } from "../people";
import { allMissions, missionSettings } from "./read";
import { notifyTagged } from "./tags";

/*
 * The review of mission photos: the queue of proofs the automatic check could not decide, and the
 * decision on one (Setujui / Tolak with a reason). Admin WAM → Misi → Tinjauan uses it today; panitia's
 * screen (not decided yet) takes the same two functions. The callers have already passed their own gate
 * (requireApiAdmin, or the panitia gate later); nothing here checks who asks.
 */

const db = () => createPrivilegedClient();
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function completionById(id: string): Promise<MwCompletion | null> {
  const read = (columns: string) => db().from("mw_mission_completions").select(columns).eq("id", id).maybeSingle();
  let { data, error } = await read(COMPLETION_COLUMNS);
  if (error && mwMissing(error as DbError)) ({ data, error } = await read(COMPLETION_COLUMNS_BASE));
  if (error) mwFail(error as DbError, MISSIONS_MIGRATION);
  return data ? completionFromRow(data as unknown as Record<string, unknown>) : null;
}

/** The proofs waiting for a person, oldest first (full names: admin and panitia only). Empty before the migration. */
export async function listReviewQueue(): Promise<ReviewItem[]> {
  const read = (columns: string) => db().from("mw_mission_completions").select(columns).in("status", [...REVIEW_STATUSES]).order("created_at").limit(200);
  let { data, error } = await read(COMPLETION_COLUMNS);
  if (error && mwMissing(error as DbError)) ({ data, error } = await read(COMPLETION_COLUMNS_BASE));
  if (error) { if (mwMissing(error as DbError)) return []; mwFail(error as DbError, MISSIONS_MIGRATION); }
  const completions = ((data ?? []) as unknown as Record<string, unknown>[]).map(row => completionFromRow(row));
  if (!completions.length) return [];
  const [missions, settings, people] = await Promise.all([allMissions(), missionSettings(), mainWamPeople()]);
  const byMission = new Map(missions.data.map(mission => [mission.id, mission]));
  const photoIds = completions.map(completion => completion.photoId).filter((id): id is string => !!id);
  const tagged = new Map<string, { id: string; name: string; department: string }[]>();
  if (photoIds.length) {
    const tags = await db().from("mw_photo_tags").select("photo_id,employee_id").in("photo_id", photoIds).is("removed_at", null);
    if (!tags.error) for (const row of (tags.data ?? []) as { photo_id: string; employee_id: string }[]) {
      const person = people.get(row.employee_id);
      tagged.set(row.photo_id, [...(tagged.get(row.photo_id) ?? []), { id: row.employee_id, name: person?.fullName ?? "Karyawan", department: person?.department ?? "" }]);
    }
  }
  return completions.flatMap(completion => {
    const mission = byMission.get(completion.missionId);
    if (!mission) return [];
    const person = people.get(completion.employeeId);
    const rules = reviewRuleLines(mission, settings.defaultRadiusM);
    return [{
      id: completion.id, missionId: mission.id, missionTitle: mission.title, points: mission.points,
      person: person?.fullName ?? "Karyawan (tidak aktif)", department: person?.department ?? "", status: completion.status, submittedAt: completion.createdAt,
      attempts: completion.attempts, maxAttempts: mission.rules.find(rule => rule.type === "batas_kali")?.times ?? null,
      photo: completion.hasProof ? mainWamAdminApi.missionProof(completion.id) : null,
      tags: completion.photoId ? tagged.get(completion.photoId) ?? [] : [], rules,
      checks: completion.checkResult?.checks ?? [], verifier: completion.checkResult?.verifier ?? null, reviewNote: completion.reviewNote,
    } satisfies ReviewItem];
  });
}

/** An approved proof: its Momen photo is shown and the tagged people are told. */
export async function afterApproval(completion: Pick<MwCompletion, "photoId">, missionTitle: string, personName: string): Promise<void> {
  if (!completion.photoId) return;
  await publishMissionPhoto(completion.photoId);
  await notifyTagged(completion.photoId, personName, missionTitle);
}

/**
 * Approve or reject a proof. Only a move the road allows is made (verify.ts canMove); a proof that
 * someone else decided meanwhile is a 409. Approval gives the points (the database's trigger) and shows
 * the Momen photo; rejection takes the points back, removes the Momen photo and tells the person why.
 */
export async function decideReview(id: string, reviewerId: string | null, input: ReviewInput, now = new Date()): Promise<{ status: MwCompletion["status"] }> {
  if (!isId(id)) throw new ServiceError(404, "Penyelesaian tidak ditemukan.");
  const current = await completionById(id);
  if (!current) throw new ServiceError(404, "Penyelesaian tidak ditemukan. Muat ulang halaman.");
  if (!canMove(current.status, input.status)) throw new ServiceError(409, current.status === input.status ? "Kiriman ini sudah diputuskan." : "Kiriman ini tidak bisa diputuskan dari keadaannya sekarang. Muat ulang halaman.");
  const stamp = now.toISOString();
  const { data, error } = await db().from("mw_mission_completions")
    .update({ status: input.status, review_note: input.status === "ditolak" ? input.note : "", reviewed_by: reviewerId, reviewed_at: stamp, updated_at: stamp })
    .eq("id", id).eq("status", current.status).select("id").maybeSingle();
  if (error) mwFail(error as DbError, MISSIONS_MIGRATION);
  if (!data) throw new ServiceError(409, "Kiriman ini sudah diputuskan orang lain. Muat ulang halaman.");
  const [missions, people] = await Promise.all([allMissions(), mainWamPeople()]);
  const mission = missions.data.find(item => item.id === current.missionId);
  const title = mission?.title ?? "Misi";
  if (input.status === "disetujui") {
    await afterApproval(current, title, people.get(current.employeeId)?.name ?? "Rekan").catch(() => undefined);
    await trySendMainWamNote({ kind: "lain", title: `Misi ${title} disetujui`, body: `${mission?.points ?? 0} poin masuk.`, to: { people: [current.employeeId], label: "Peserta misi" }, link: mainWamPath.missions, by: reviewerId, tag: `misi-${current.id}` });
  } else {
    if (current.photoId) {
      await withdrawMissionPhoto(current.photoId).catch(() => undefined);
      await db().from("mw_mission_completions").update({ photo_id: null }).eq("id", id);
    }
    await trySendMainWamNote({ kind: "lain", title: `Misi ${title} ditolak`, body: input.note || "Foto belum memenuhi syarat.", to: { people: [current.employeeId], label: "Peserta misi" }, link: mainWamPath.missions, by: reviewerId, tag: `misi-${current.id}` });
  }
  return { status: input.status };
}
