import { z } from "zod";
import { votingState, type VotingState } from "../module-state";
import { dayWord, wibDate, wibTime } from "../rundown";
import type { MwAwardApproval, MwAwardCategory, MwAwardNominee } from "../types";

/*
 * Voting Awarding (V01, V02, B06; RISET §6, KONTRAK §8): categories with nominees; one vote per
 * person per category, changeable until it closes, never for oneself; the window by the server's
 * clock (the database repeats it). A vote is secret, not anonymous: only aggregates leave the
 * server, to the BOD (and Admin WAM), never the running count to participants. The BOD approve the
 * winner before it is announced. Computed categories (otomatis, "Tim paling kompak" from Wellbeing
 * points) are not shown anywhere until Wellbeing comes from Journey. Pure.
 */

/** A nominee as the screens show it: a person by nama panggilan, a Momen photo, or a name. */
export type NomineeView = { id: string; kind: "orang" | "foto" | "label"; name: string; department: string; photo: string | null; reason: string; ownerId: string | null; image: string | null };

export const voteSchema = z.object({ nomineeId: z.uuid("Pilih satu nominasi.") }).strict();
export const approveSchema = z.object({ nomineeId: z.uuid("Pilih pemenangnya.") }).strict();

/** Shown to anyone in the app: published, voted or judged (computed ones are hidden). */
export const shownCategories = (categories: readonly MwAwardCategory[]) =>
  categories.filter(category => category.published && category.method !== "otomatis").sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "id"));

export const methodLabel = (category: Pick<MwAwardCategory, "method">) => (category.method === "voting" ? "Voting karyawan" : category.method === "juri" ? "Juri BOD" : "Otomatis");

const clock = (iso: string) => wibTime(iso).replace(":", ".");
/** "15.00" today, "Rab, 6 Jan · 15.00" another day. */
export function when(iso: string, now: Date): string {
  const today = wibDate(now.toISOString());
  return wibDate(iso) === today ? clock(iso) : `${dayWord(wibDate(iso), today)} · ${clock(iso)}`;
}

/** Announced: approved and its announcement time has come (or it has no time: approved is enough). */
export function isAnnounced(category: Pick<MwAwardCategory, "announceAt">, approval: MwAwardApproval | null | undefined, now: Date): boolean {
  if (!approval) return false;
  return !category.announceAt || now.getTime() >= Date.parse(category.announceAt);
}

/** A category card in V01 for a participant. */
export type VoteCard =
  | { kind: "pilih"; closesAt: string }
  | { kind: "terkirim"; closesAt: string }
  | { kind: "belum"; opensAt: string }
  | { kind: "ditutup"; announceAt: string | null }
  | { kind: "juri" }
  | { kind: "diumumkan"; nomineeId: string };
export function voteCard(category: MwAwardCategory, voted: boolean, approval: MwAwardApproval | null | undefined, now: Date): VoteCard {
  if (approval && isAnnounced(category, approval, now)) return { kind: "diumumkan", nomineeId: approval.nomineeId };
  if (category.method !== "voting") return { kind: "juri" };
  const state = votingState(category, now);
  if (state === "buka") return voted ? { kind: "terkirim", closesAt: category.closesAt! } : { kind: "pilih", closesAt: category.closesAt! };
  if (state === "belum") return { kind: "belum", opensAt: category.opensAt ?? "" };
  return { kind: "ditutup", announceAt: category.announceAt };
}

/** V01's banner: the next announcement among the shown categories ("Diumumkan di Gala Dinner · 19.00"). */
export function nextAnnouncement(categories: readonly MwAwardCategory[], now: Date): { at: string; sessionId: string | null } | null {
  const upcoming = categories.filter(category => category.announceAt && Date.parse(category.announceAt) > now.getTime())
    .sort((a, b) => Date.parse(a.announceAt!) - Date.parse(b.announceAt!));
  return upcoming[0] ? { at: upcoming[0].announceAt!, sessionId: upcoming[0].sessionId } : null;
}

/** The nominees a person may vote for (V02 hides oneself and one's own photos; the server refuses them anyway). */
export function votableNominees(nominees: readonly MwAwardNominee[], voterId: string, photoOwners: ReadonlyMap<string, string>): MwAwardNominee[] {
  return nominees.filter(nominee => nominee.employeeId !== voterId && !(nominee.photoId && photoOwners.get(nominee.photoId) === voterId));
}

/** Why a vote is refused before it reaches the database; null when it may be cast. */
export function voteRefusal(category: MwAwardCategory | undefined, nomineeId: string, voterId: string, photoOwners: ReadonlyMap<string, string>, now: Date): { status: number; message: string } | null {
  if (!category || !category.published || category.method === "otomatis") return { status: 404, message: "Kategori tidak ditemukan." };
  if (category.method !== "voting") return { status: 409, message: "Kategori ini ditentukan juri BOD." };
  const state: VotingState = votingState(category, now);
  if (state === "belum") return { status: 409, message: "Voting belum dibuka." };
  if (state === "tutup") return { status: 409, message: "Voting sudah ditutup." };
  const nominee = category.nominees.find(item => item.id === nomineeId);
  if (!nominee) return { status: 422, message: "Nominasi tidak ditemukan. Muat ulang lalu pilih lagi." };
  if (nominee.employeeId === voterId || (nominee.photoId && photoOwners.get(nominee.photoId) === voterId)) return { status: 422, message: "Kamu tidak bisa memilih dirimu sendiri." };
  return null;
}

/** One nominee in the BOD's count: votes and rank (competition ranking: equal votes, equal rank). */
export type TallyRow = { nominee: MwAwardNominee; votes: number; rank: number };
export function rankTally(nominees: readonly MwAwardNominee[], counts: ReadonlyMap<string, number>): TallyRow[] {
  const rows = nominees.map(nominee => ({ nominee, votes: counts.get(nominee.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes || a.nominee.sort - b.nominee.sort);
  return rows.map(row => ({ ...row, rank: 1 + rows.filter(other => other.votes > row.votes).length }));
}
export const totalVotes = (rows: readonly TallyRow[]) => rows.reduce((sum, row) => sum + row.votes, 0);
/** More than one nominee shares the top (the BOD decide; RISET §6). */
export const topTied = (rows: readonly TallyRow[]) => rows.filter(row => row.rank === 1 && row.votes > 0).length > 1;

/** A category in B06 for the BOD. */
export type ApprovalCard =
  | { kind: "voting-buka"; closesAt: string }
  | { kind: "voting-belum"; opensAt: string }
  /** Closed, waiting for the BOD (or a jury category without a winner yet). */
  | { kind: "perlu" }
  | { kind: "disetujui"; approval: MwAwardApproval };
export function approvalCard(category: MwAwardCategory, approval: MwAwardApproval | null | undefined, now: Date): ApprovalCard {
  if (approval) return { kind: "disetujui", approval };
  if (category.method === "voting") {
    const state = votingState(category, now);
    if (state === "buka") return { kind: "voting-buka", closesAt: category.closesAt! };
    if (state === "belum") return { kind: "voting-belum", opensAt: category.opensAt ?? "" };
  }
  return { kind: "perlu" };
}
/** "2 menunggu persetujuanmu". */
export const waitingCount = (categories: readonly MwAwardCategory[], approvals: ReadonlyMap<string, MwAwardApproval>, now: Date) =>
  shownCategories(categories).filter(category => approvalCard(category, approvals.get(category.id), now).kind === "perlu").length;

/** Why an approval is refused; null when the BOD may approve this nominee now. */
export function approvalRefusal(category: MwAwardCategory | undefined, nomineeId: string, now: Date): { status: number; message: string } | null {
  if (!category || !category.published || category.method === "otomatis") return { status: 404, message: "Kategori tidak ditemukan." };
  if (category.method === "voting" && votingState(category, now) !== "tutup") return { status: 409, message: "Pemenang bisa disetujui setelah voting ditutup." };
  if (!category.nominees.some(nominee => nominee.id === nomineeId)) return { status: 422, message: "Nominasi tidak ditemukan. Muat ulang lalu pilih lagi." };
  return null;
}
