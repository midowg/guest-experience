import "server-only";
import { categoryRow, type AwardCategoryInput, type NomineeInput, type SilentQuestionInput } from "@/lib/main-wam/modul/admin";
import { closedTally } from "@/lib/main-wam/modul/awards";
import { silentShownCount, silentState, type SilentState } from "@/lib/main-wam/module-state";
import { AWARD_COLUMNS, awardFromRow, SILENT_COLUMNS, silentFromRow } from "@/lib/main-wam/rows";
import type { MwAwardApproval, MwAwardCategory, MwSession, MwSilentQuestion } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { isR2Configured, presignDownload } from "../../r2";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing } from "../errors";
import { mainWamPeople } from "../people";
import { allSessions, awardApprovals, awardCategories, listGroups, silentQuestions, silentResults } from "../read";
import { voteCounts } from "./awards";

/*
 * Admin WAM → Main WAM → Awarding and Silent Meeting (agen D). Every caller has passed
 * requireAdminPage/requireApiAdmin. Admins see full names (aturan-wam §4); the counts per nominee
 * (aggregates, never who voted for whom) only once voting closed, as the BOD (audit M1); of Silent
 * Meeting its state, and how many sent only once closed for good from 5 feedbacks of 5 people
 * (audit H2), never the text (that is the BOD's recap).
 */

const db = () => createPrivilegedClient();
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export type AdminPerson = { id: string; fullName: string; department: string };
export type AdminPhoto = { id: string; owner: string; reactions: number; src: string | null };
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

/** The photos with the most reactions (for a Foto Momen terbaik category), with small signed pictures. */
async function likedPhotos(limit = 60): Promise<AdminPhoto[]> {
  const reactions = await db().from("mw_photo_reactions").select("photo_id").limit(20000);
  if (reactions.error) return [];
  const counts = new Map<string, number>();
  for (const row of (reactions.data ?? []) as { photo_id: string }[]) counts.set(row.photo_id, (counts.get(row.photo_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (!top.length) return [];
  const { data, error } = await db().from("mw_photos").select("id,owner_id,thumb_key,file_key").in("id", top).eq("status", "tampil").eq("audience", "semua");
  if (error) return [];
  const people = await mainWamPeople();
  const storage = isR2Configured();
  const rows = (data ?? []) as { id: string; owner_id: string; thumb_key: string | null; file_key: string }[];
  const photos = await Promise.all(rows.map(async row => ({
    id: row.id, owner: people.get(row.owner_id)?.fullName ?? "Peserta", reactions: counts.get(row.id) ?? 0,
    src: storage ? await presignDownload(row.thumb_key ?? row.file_key, { seconds: 1800 }).catch(() => null) : null,
  })));
  return photos.sort((a, b) => b.reactions - a.reactions);
}

/** Everything the Awarding page needs, in one round of reads. Counts only of closed voting (audit M1). */
export async function adminAwards(now = new Date()): Promise<AdminAwards> {
  const [categories, approvals, counts, sessions, people, groups, photos] = await Promise.all([
    awardCategories(true), awardApprovals(), voteCounts(), allSessions(), mainWamPeople(), listGroups(), likedPhotos(),
  ]);
  const active = [...people.values()].filter(person => person.active).sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
  const tallies = categories.data.flatMap(category => {
    const tally = closedTally(category, counts.get(category.id), now);
    return tally ? [{ categoryId: category.id, ...tally }] : [];
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

/** Photos that may be nominated: shown to everyone (not a kelompok's, not hidden), so every voter can open them (R8). */
async function nominablePhotos(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await db().from("mw_photos").select("id").in("id", ids).eq("status", "tampil").eq("audience", "semua");
  if (error) mwFail(error);
  return new Set(((data ?? []) as { id: string }[]).map(row => row.id));
}

/**
 * Replaces the nominees (the list's order is the order shown). Nominees that already have votes
 * stay: removing one would drop its votes, so it is refused. A new photo nominee is a photo for
 * everyone, still shown.
 */
export async function setNominees(categoryId: string, nominees: NomineeInput[]): Promise<MwAwardCategory> {
  const category = await categoryById(categoryId);
  const current = new Set(category.nominees.map(nominee => nominee.photoId).filter((id): id is string => !!id));
  const newPhotos = nominees.map(item => item.photoId).filter((id): id is string => !!id && !current.has(id));
  const allowed = await nominablePhotos(newPhotos);
  if (newPhotos.some(id => !allowed.has(id))) throw new ServiceError(422, "Foto ini tidak bisa dinominasikan. Pilih foto Momen untuk semua yang masih tampil.");
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

export type AdminSilentQuestion = MwSilentQuestion & {
  state: SilentState | null;
  /** Feedbacks, only once closed for good from 5 feedbacks of 5 people; never while open (audit H2). */
  count: number | null;
  /** Opened (or closed after it opened): its question, topics and session stay, and it is not deleted. */
  locked: boolean;
};
export type AdminSilent = {
  migrated: boolean;
  questions: AdminSilentQuestion[];
  sessions: Pick<MwSession, "id" | "title" | "startsAt" | "endsAt" | "status" | "module">[];
};

const LOCKED = "Silent Meeting ini sudah dibuka, jadi pertanyaan, topik, dan sesinya tetap.";
/** Its state, and whether it has opened (cancelled before it ever opened is not locked for deleting). */
function questionState(question: MwSilentQuestion, session: MwSession | undefined, now: Date) {
  const state = session ? silentState(question, session, now) : null;
  const opened = !!question.openedAt || !!question.closedAt || (!!session && session.status === "terbit" && now.getTime() >= Date.parse(session.startsAt));
  return { state, edit: state !== null && state !== "belum", remove: state === "buka" || (state === "tutup" && opened) };
}

export async function adminSilent(now = new Date()): Promise<AdminSilent> {
  const [questions, sessions, results] = await Promise.all([silentQuestions(), allSessions(), silentResults()]);
  const byId = new Map(sessions.data.map(session => [session.id, session]));
  return {
    migrated: questions.migrated,
    questions: questions.data.map(question => {
      const { state, edit } = questionState(question, byId.get(question.sessionId), now);
      return { ...question, state, count: state === "tutup" ? silentShownCount(results.data.get(question.id)) : null, locked: edit };
    }),
    sessions: sessions.data.filter(session => session.status !== "batal").map(({ id, title, startsAt, endsAt, status, module }) => ({ id, title, startsAt, endsAt, status, module })),
  };
}

async function questionNow(id: string, now: Date) {
  const [questions, sessions] = await Promise.all([silentQuestions(), allSessions()]);
  const question = questions.data.find(item => item.id === id);
  if (!question) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  return { question, ...questionState(question, sessions.data.find(session => session.id === question.sessionId), now) };
}

const questionRow = (input: SilentQuestionInput) => ({ session_id: input.sessionId, question: input.question, topics: input.topics, updated_at: new Date().toISOString() });
function questionFail(error: { code?: string; message?: string }): never {
  if (error.code === "23505") throw new ServiceError(409, "Sesi ini sudah punya pertanyaan Silent Meeting.");
  if (error.code === "23503") throw new ServiceError(422, "Sesi tidak ditemukan.");
  if (/silent_locked|silent_final/.test(error.message ?? "")) throw new ServiceError(409, LOCKED);
  mwFail(error);
}

export async function createQuestion(input: SilentQuestionInput): Promise<MwSilentQuestion> {
  const { data, error } = await db().from("mw_silent_questions").insert(questionRow(input)).select(SILENT_COLUMNS).single();
  if (error) questionFail(error);
  return silentFromRow(data as Record<string, unknown>);
}

/** Before it opens: anything. Once it opened: nothing (the database refuses it too), so a closed one cannot be moved to reopen. */
export async function updateQuestion(id: string, input: SilentQuestionInput, now = new Date()): Promise<MwSilentQuestion> {
  if (!isId(id)) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  const { question, edit } = await questionNow(id, now);
  const same = question.sessionId === input.sessionId && question.question === input.question && question.topics.join("\n") === input.topics.join("\n");
  if (edit && !same) throw new ServiceError(409, LOCKED);
  if (edit) return question;
  const { data, error } = await db().from("mw_silent_questions").update(questionRow(input)).eq("id", id).select(SILENT_COLUMNS).maybeSingle();
  if (error) questionFail(error);
  if (!data) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  return silentFromRow(data as Record<string, unknown>);
}

/** Only before it ever opened: its feedback is never deleted with it. */
export async function deleteQuestion(id: string, now = new Date()): Promise<void> {
  if (!isId(id)) throw new ServiceError(404, "Pertanyaan tidak ditemukan.");
  const { remove } = await questionNow(id, now);
  if (remove) throw new ServiceError(409, "Silent Meeting ini sudah dibuka, jadi pertanyaannya tidak bisa dihapus.");
  const { error } = await db().from("mw_silent_questions").delete().eq("id", id);
  if (error) mwFail(error);
}
