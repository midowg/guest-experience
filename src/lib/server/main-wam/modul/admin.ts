import "server-only";
import { categoryRow, type AwardCategoryInput, type NomineeInput, type SilentQuestionInput } from "@/lib/main-wam/modul/admin";
import { rankTally, totalVotes } from "@/lib/main-wam/modul/awards";
import { AWARD_COLUMNS, awardFromRow, SILENT_COLUMNS, silentFromRow } from "@/lib/main-wam/rows";
import type { MwAwardApproval, MwAwardCategory, MwSession, MwSilentQuestion } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { isR2Configured, presignDownload } from "../../r2";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing } from "../errors";
import { mainWamPeople } from "../people";
import { allSessions, awardApprovals, awardCategories, listGroups, silentQuestions } from "../read";
import { voteCounts } from "./awards";
import { silentCounts } from "./silent";

/*
 * Admin WAM → Main WAM → Awarding and Silent Meeting (agen D). Every caller has passed
 * requireAdminPage/requireApiAdmin. Admins see full names (aturan-wam §4) and the counts per
 * nominee (aggregates, never who voted for whom); of Silent Meeting only how many sent, never the
 * text (that is the BOD's recap).
 */

const db = () => createPrivilegedClient();
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export type AdminPerson = { id: string; fullName: string; department: string };
export type AdminPhoto = { id: string; owner: string; hearts: number; src: string | null };
export type AdminTally = { categoryId: string; total: number; rows: { nomineeId: string; votes: number; rank: number }[] };
export type AdminAwards = {
  migrated: boolean;
  categories: MwAwardCategory[];
  approvals: MwAwardApproval[];
  tallies: AdminTally[];
  sessions: Pick<MwSession, "id" | "title" | "startsAt" | "status">[];
  people: AdminPerson[];
  groups: string[];
  departments: string[];
  photos: AdminPhoto[];
  approverNames: Record<string, string>;
};

/** The photos most liked (for a Foto Momen terbaik category), with small signed pictures. */
async function likedPhotos(limit = 60): Promise<AdminPhoto[]> {
  const hearts = await db().from("mw_photo_hearts").select("photo_id").limit(20000);
  if (hearts.error) return [];
  const counts = new Map<string, number>();
  for (const row of (hearts.data ?? []) as { photo_id: string }[]) counts.set(row.photo_id, (counts.get(row.photo_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (!top.length) return [];
  const { data, error } = await db().from("mw_photos").select("id,owner_id,thumb_key,file_key").in("id", top).eq("status", "tampil").eq("audience", "semua");
  if (error) return [];
  const people = await mainWamPeople();
  const storage = isR2Configured();
  const rows = (data ?? []) as { id: string; owner_id: string; thumb_key: string | null; file_key: string }[];
  const photos = await Promise.all(rows.map(async row => ({
    id: row.id, owner: people.get(row.owner_id)?.fullName ?? "Peserta", hearts: counts.get(row.id) ?? 0,
    src: storage ? await presignDownload(row.thumb_key ?? row.file_key, { seconds: 1800 }).catch(() => null) : null,
  })));
  return photos.sort((a, b) => b.hearts - a.hearts);
}

/** Everything the Awarding page needs, in one round of reads. */
export async function adminAwards(): Promise<AdminAwards> {
  const [categories, approvals, counts, sessions, people, groups, photos] = await Promise.all([
    awardCategories(true), awardApprovals(), voteCounts(), allSessions(), mainWamPeople(), listGroups(), likedPhotos(),
  ]);
  const active = [...people.values()].filter(person => person.active).sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
  const tallies = categories.data.filter(category => category.method === "voting").map(category => {
    const rows = rankTally(category.nominees, counts.get(category.id) ?? new Map());
    return { categoryId: category.id, total: totalVotes(rows), rows: rows.map(row => ({ nomineeId: row.nominee.id, votes: row.votes, rank: row.rank })) };
  });
  return {
    migrated: categories.migrated,
    categories: categories.data,
    approvals: approvals.data,
    tallies,
    sessions: sessions.data.filter(session => session.status !== "batal").map(({ id, title, startsAt, status }) => ({ id, title, startsAt, status })),
    people: active.map(person => ({ id: person.id, fullName: person.fullName, department: person.department })),
    groups: groups.data.map(group => `Kelompok ${group.number} · ${group.name}`),
    departments: [...new Set(active.map(person => person.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
    photos,
    approverNames: Object.fromEntries(approvals.data.map(approval => [approval.approvedBy, people.get(approval.approvedBy)?.fullName ?? "BOD"])),
  };
}

async function categoryById(id: string): Promise<MwAwardCategory> {
  if (!isId(id)) throw new ServiceError(404, "Kategori tidak ditemukan.");
  const { data, error } = await db().from("mw_award_categories").select(AWARD_COLUMNS).eq("id", id).maybeSingle();
  if (error) mwFail(error);
  if (!data) throw new ServiceError(404, "Kategori tidak ditemukan.");
  return awardFromRow(data as Record<string, unknown>);
}

/** A voting category with votes keeps its window shape: it cannot become a jury category. */
async function hasVotes(categoryId: string): Promise<boolean> {
  const { count, error } = await db().from("mw_award_votes").select("voter_id", { count: "exact", head: true }).eq("category_id", categoryId);
  if (error) { if (mwMissing(error)) return false; databaseError(error); }
  return (count ?? 0) > 0;
}

export async function createCategory(input: AwardCategoryInput): Promise<MwAwardCategory> {
  if (input.published) throw new ServiceError(422, "Simpan kategori dan nominasinya dulu, baru terbitkan.");
  const { data, error } = await db().from("mw_award_categories").insert(categoryRow(input)).select(AWARD_COLUMNS).single();
  if (error) mwFail(error);
  return awardFromRow(data as Record<string, unknown>);
}

export async function updateCategory(id: string, input: AwardCategoryInput): Promise<MwAwardCategory> {
  const current = await categoryById(id);
  if (current.method === "voting" && input.method !== "voting" && await hasVotes(id)) throw new ServiceError(409, "Kategori ini sudah punya suara, jadi tetap voting karyawan.");
  if (input.published && !current.nominees.length) throw new ServiceError(422, "Tambahkan nominasi sebelum diterbitkan.");
  const { data, error } = await db().from("mw_award_categories").update(categoryRow(input)).eq("id", id).select(AWARD_COLUMNS).single();
  if (error) mwFail(error);
  return awardFromRow(data as Record<string, unknown>);
}

export async function deleteCategory(id: string): Promise<void> {
  await categoryById(id);
  if (await hasVotes(id)) throw new ServiceError(409, "Kategori ini sudah punya suara. Sembunyikan (batal terbit), jangan dihapus.");
  const { error } = await db().from("mw_award_categories").delete().eq("id", id);
  if (error) mwFail(error);
}

/**
 * Replaces the nominees (the list's order is the order shown). Nominees that already have votes
 * stay: removing one would drop its votes, so it is refused.
 */
export async function setNominees(categoryId: string, nominees: NomineeInput[]): Promise<MwAwardCategory> {
  const category = await categoryById(categoryId);
  const keyOf = (item: { employeeId: string | null; photoId: string | null; label: string }) => item.employeeId ?? item.photoId ?? item.label.toLowerCase();
  const wanted = new Map(nominees.map((item, index) => [keyOf(item), { item, index }]));
  const counts = (await voteCounts()).get(categoryId) ?? new Map<string, number>();
  const removed = category.nominees.filter(nominee => !wanted.has(keyOf(nominee)));
  if (removed.some(nominee => (counts.get(nominee.id) ?? 0) > 0)) throw new ServiceError(409, "Nominasi yang sudah dipilih orang tidak bisa dihapus.");
  if (category.published && !nominees.length) throw new ServiceError(422, "Kategori yang terbit perlu nominasi. Batalkan terbit dulu.");
  if (removed.length) {
    const { error } = await db().from("mw_award_nominees").delete().in("id", removed.map(nominee => nominee.id));
    if (error) mwFail(error);
  }
  const existing = new Map(category.nominees.map(nominee => [keyOf(nominee), nominee]));
  for (const [key, { item, index }] of wanted) {
    const found = existing.get(key);
    const row = { employee_id: item.employeeId, photo_id: item.photoId, label: item.label, reason: item.reason, sort: index + 1 };
    const { error } = found
      ? await db().from("mw_award_nominees").update({ label: item.label, reason: item.reason, sort: index + 1 }).eq("id", found.id)
      : await db().from("mw_award_nominees").insert({ ...row, category_id: categoryId });
    if (error) mwFail(error);
  }
  return categoryById(categoryId);
}

/* ── Silent Meeting ─────────────────────────────────────────────────────────────────────────────── */

export type AdminSilent = {
  migrated: boolean;
  questions: (MwSilentQuestion & { count: number; people: number })[];
  sessions: Pick<MwSession, "id" | "title" | "startsAt" | "endsAt" | "status" | "module">[];
};

export async function adminSilent(): Promise<AdminSilent> {
  const [questions, sessions] = await Promise.all([silentQuestions(), allSessions()]);
  const counted = await Promise.all(questions.data.map(async question => ({ ...question, ...(await silentCounts(question.id)) })));
  return {
    migrated: questions.migrated,
    questions: counted,
    sessions: sessions.data.filter(session => session.status !== "batal").map(({ id, title, startsAt, endsAt, status, module }) => ({ id, title, startsAt, endsAt, status, module })),
  };
}

const questionRow = (input: SilentQuestionInput) => ({ session_id: input.sessionId, question: input.question, topics: input.topics, auto_close: input.autoClose, updated_at: new Date().toISOString() });
function questionFail(error: { code?: string; message?: string }): never {
  if (error.code === "23505") throw new ServiceError(409, "Sesi ini sudah punya pertanyaan Silent Meeting.");
  if (error.code === "23503") throw new ServiceError(422, "Sesi tidak ditemukan.");
  mwFail(error);
}

export async function createQuestion(input: SilentQuestionInput): Promise<MwSilentQuestion> {
  const { data, error } = await db().from("mw_silent_questions").insert(questionRow(input)).select(SILENT_COLUMNS).single();
  if (error) questionFail(error);
  return silentFromRow(data as Record<string, unknown>);
}

export async function updateQuestion(id: string, input: SilentQuestionInput): Promise<MwSilentQuestion> {
  if (!isId(id)) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  const { count } = await silentCounts(id);
  if (count > 0) {
    const { data: current } = await db().from("mw_silent_questions").select("session_id,question").eq("id", id).maybeSingle();
    const row = current as { session_id: string; question: string } | null;
    if (row && (row.session_id !== input.sessionId || row.question !== input.question)) throw new ServiceError(409, "Sudah ada masukan, jadi pertanyaan dan sesinya tidak bisa diubah.");
  }
  const { data, error } = await db().from("mw_silent_questions").update(questionRow(input)).eq("id", id).select(SILENT_COLUMNS).maybeSingle();
  if (error) questionFail(error);
  if (!data) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  return silentFromRow(data as Record<string, unknown>);
}

export async function deleteQuestion(id: string): Promise<void> {
  if (!isId(id)) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  const { count } = await silentCounts(id);
  if (count > 0) throw new ServiceError(409, "Sudah ada masukan. Pertanyaan ini tidak bisa dihapus.");
  const { error } = await db().from("mw_silent_questions").delete().eq("id", id);
  if (error) mwFail(error);
}
