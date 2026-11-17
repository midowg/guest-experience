import "server-only";
import { MODUL_MIGRATION } from "@/lib/main-wam/modul/absen";
import { approvalRefusal, shownCategories, voteRefusal, type NomineeView } from "@/lib/main-wam/modul/awards";
import type { MainWamViewer, MwAwardApproval, MwAwardCategory, MwPerson } from "@/lib/main-wam/types";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing } from "../errors";
import { trySendMainWamNote } from "../notes";
import { mainWamPeople } from "../people";
import { awardApprovals, awardCategories } from "../read";

/*
 * Voting Awarding on the server (V01, V02, B06; RISET §6). A vote is secret, not anonymous: the
 * voter's id is stored (one vote per person per category, PK), but no vote leaves the server except
 * the person's own choice to that person, and counts per nominee to the BOD and Admin WAM. The
 * window and "not for oneself" hold here and in the database (mw_award_vote_check, fondasi).
 */

const db = () => createPrivilegedClient();

export type { NomineeView };

/** The owners of nominated Momen photos (for "not your own photo" and the caption "Dimas"). */
export async function photoOwners(categories: readonly MwAwardCategory[]): Promise<Map<string, string>> {
  const ids = [...new Set(categories.flatMap(category => category.nominees.map(nominee => nominee.photoId).filter((id): id is string => !!id)))];
  if (!ids.length) return new Map();
  const { data, error } = await db().from("mw_photos").select("id,owner_id").in("id", ids);
  if (error) { if (mwMissing(error)) return new Map(); databaseError(error); }
  return new Map(((data ?? []) as { id: string; owner_id: string }[]).map(row => [row.id, row.owner_id]));
}

/** Every nominee of these categories as shown (one read of people and photo owners, no N+1). */
export async function nomineeViews(categories: readonly MwAwardCategory[]): Promise<{ nominees: Map<string, NomineeView>; owners: Map<string, string> }> {
  const [people, owners] = await Promise.all([mainWamPeople(), photoOwners(categories)]);
  const person = (id: string | null | undefined): MwPerson | null => {
    const found = id ? people.get(id) : undefined;
    return found ? { id: found.id, name: found.name, department: found.department, photo: found.photo } : null;
  };
  const nominees = new Map<string, NomineeView>();
  for (const category of categories) for (const nominee of category.nominees) {
    if (nominee.employeeId) {
      const who = person(nominee.employeeId);
      nominees.set(nominee.id, { id: nominee.id, kind: "orang", name: who?.name ?? (nominee.label || "Rekan"), department: who?.department ?? "", photo: who?.photo ?? null, reason: nominee.reason, ownerId: nominee.employeeId, image: null });
    } else if (nominee.photoId) {
      const owner = owners.get(nominee.photoId) ?? null;
      nominees.set(nominee.id, { id: nominee.id, kind: "foto", name: person(owner)?.name ?? "Foto Momen", department: "", photo: null, reason: nominee.reason || nominee.label, ownerId: owner, image: mainWamApi.photoFile(nominee.photoId, "kecil") });
    } else {
      nominees.set(nominee.id, { id: nominee.id, kind: "label", name: nominee.label, department: "", photo: null, reason: nominee.reason, ownerId: null, image: null });
    }
  }
  return { nominees, owners };
}

/** This person's own votes (category → nominee): theirs alone, for "Terkirim · Ubah" and V02's choice. */
export async function myVotes(employeeId: string): Promise<Map<string, string>> {
  const { data, error } = await db().from("mw_award_votes").select("category_id,nominee_id").eq("voter_id", employeeId).limit(50);
  if (error) { if (mwMissing(error)) return new Map(); databaseError(error); }
  return new Map(((data ?? []) as { category_id: string; nominee_id: string }[]).map(row => [row.category_id, row.nominee_id]));
}

/** Votes per nominee (category → nominee → count), without voters: for the BOD and Admin WAM only. */
export async function voteCounts(): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("mw_award_votes").select("category_id,nominee_id").order("category_id").order("nominee_id").range(from, from + 999);
    if (error) { if (mwMissing(error)) return out; databaseError(error); }
    for (const row of (data ?? []) as { category_id: string; nominee_id: string }[]) {
      const counts = out.get(row.category_id) ?? new Map<string, number>();
      counts.set(row.nominee_id, (counts.get(row.nominee_id) ?? 0) + 1);
      out.set(row.category_id, counts);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

/** The categories everyone sees (published, not computed), with approvals by category. */
export async function awardsShown(): Promise<{ categories: MwAwardCategory[]; approvals: Map<string, MwAwardApproval>; migrated: boolean }> {
  const [categories, approvals] = await Promise.all([awardCategories(), awardApprovals()]);
  return { categories: shownCategories(categories.data), approvals: new Map(approvals.data.map(approval => [approval.categoryId, approval])), migrated: categories.migrated };
}

/** V02 → V01: the person's vote in a category (a new one, or a change while it is open). */
export async function castVote(categoryId: string, nomineeId: string, viewer: Pick<MainWamViewer, "id">, now: Date): Promise<void> {
  const { categories } = await awardsShown();
  const category = categories.find(item => item.id === categoryId);
  const owners = category ? await photoOwners([category]) : new Map<string, string>();
  const refused = voteRefusal(category, nomineeId, viewer.id, owners, now);
  if (refused) throw new ServiceError(refused.status, refused.message);
  const { error } = await db().from("mw_award_votes")
    .upsert({ category_id: categoryId, voter_id: viewer.id, nominee_id: nomineeId }, { onConflict: "category_id,voter_id" });
  if (error) {
    if (/vote_closed/.test(error.message ?? "")) throw new ServiceError(409, "Voting sudah ditutup.");
    if (/vote_self/.test(error.message ?? "")) throw new ServiceError(422, "Kamu tidak bisa memilih dirimu sendiri.");
    mwFail(error);
  }
}

/** B06: a BOD approves the winner (voting: once it closed; jury: any time). Panitia hear of it. */
export async function approveWinner(categoryId: string, nomineeId: string, viewer: Pick<MainWamViewer, "id" | "name">, now: Date): Promise<MwAwardApproval> {
  const { categories } = await awardsShown();
  const category = categories.find(item => item.id === categoryId);
  const refused = approvalRefusal(category, nomineeId, now);
  if (refused) throw new ServiceError(refused.status, refused.message);
  const { data, error } = await db().from("mw_award_approvals")
    .upsert({ category_id: categoryId, nominee_id: nomineeId, approved_by: viewer.id, approved_at: now.toISOString() }, { onConflict: "category_id" })
    .select("category_id,nominee_id,approved_by,approved_at").single();
  if (error) {
    if (/approval_open/.test(error.message ?? "")) throw new ServiceError(409, "Pemenang bisa disetujui setelah voting ditutup.");
    if (/approval_auto/.test(error.message ?? "")) throw new ServiceError(404, "Kategori tidak ditemukan.");
    mwFail(error, MODUL_MIGRATION);
  }
  const row = data as { category_id: string; nominee_id: string; approved_by: string; approved_at: string };
  const { nominees } = await nomineeViews([category!]);
  const winner = nominees.get(nomineeId);
  await trySendMainWamNote({
    kind: "voting", title: "Pemenang awarding disetujui", body: `${category!.title}: ${winner?.name ?? "pemenang"}. Disetujui ${viewer.name}.`,
    to: { audience: { type: "panitia" } }, link: mainWamPath.home, by: viewer.id, tag: `awarding-${categoryId}`,
  });
  return { categoryId: row.category_id, nomineeId: row.nominee_id, approvedBy: row.approved_by, approvedAt: row.approved_at };
}

/** Names of who approved (B06 "Disetujui Wulan · 15.40"). */
export async function approverNames(approvals: Iterable<MwAwardApproval>): Promise<Map<string, string>> {
  const people = await mainWamPeople();
  return new Map([...approvals].map(approval => [approval.approvedBy, people.get(approval.approvedBy)?.name ?? "BOD"]));
}
