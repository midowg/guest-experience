import "server-only";
import type { AnswerValue } from "@/lib/pra-wam/questionnaire";
import {
  blocked, roomNotes, STAY_KEYS, STAY_MIGRATION, stayPerson, suggestRooms, type RoomLine, type StayPerson,
} from "@/lib/pra-wam/stay";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import type { HrUnlock } from "./hr-lock";
import { currentForm, formContent, questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * Room pairing for the WAM stay (migration 202611050001). Everything here except myRoom works on
 * stay answers (`hr`), so the routes and the Kamar page call it only with Data HR open; the
 * unlock's person is kept as who placed someone. myRoom is the participant's own room, once HR
 * has published the pairing, with roommates by name and department only.
 */

export const stayMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") && /cq_stay|rooms_published_at/.test(error.message ?? "");
export const stayWaiting = () => new ServiceError(503, `Kamar menunggu migrasi ${STAY_MIGRATION}.`);

const failed = (error: { code?: string; message?: string }): never => {
  if (stayMissing(error)) throw stayWaiting();
  if (questionnaireMissing(error)) throw questionnaireWaiting();
  // The database's own refusals (a full room, a capacity below the people in it) are plain words.
  if (error.code === "P0001") throw new ServiceError(409, error.message ?? "Perubahan ditolak.");
  if (error.code === "23505") throw new ServiceError(409, "Nama kamar ini sudah dipakai.");
  return databaseError({ message: error.message ?? "", code: error.code });
};

type RoomRow = { id: string; name: string; kind: string; capacity: number; reviewed_at: string | null; sort: number };
type MemberRow = { employee_id: string; room_id: string };

async function readRooms(formId: string): Promise<{ rooms: RoomRow[]; members: MemberRow[] }> {
  const client = createPrivilegedClient();
  const [rooms, members] = await Promise.all([
    client.from("cq_stay_rooms").select("id,name,kind,capacity,reviewed_at,sort").eq("form_id", formId).order("sort").order("name").limit(2000),
    client.from("cq_stay_members").select("employee_id,room_id").eq("form_id", formId).limit(5000),
  ]);
  for (const result of [rooms, members]) if (result.error) failed(result.error);
  return { rooms: (rooms.data ?? []) as RoomRow[], members: (members.data ?? []) as MemberRow[] };
}

/** Every active employee with their stay answers (missing answers stay null). */
async function stayPeople(formId: string): Promise<StayPerson[]> {
  const [{ questions }, people] = await Promise.all([formContent(formId), listPeople()]);
  const keys = Object.values(STAY_KEYS) as string[];
  const stayQuestions = questions.filter(question => keys.includes(question.key));
  const keyOf = new Map(stayQuestions.map(question => [question.id, question.key]));
  const answers = new Map<string, Record<string, AnswerValue>>();
  if (stayQuestions.length) {
    const client = createPrivilegedClient();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from("cq_answers").select("employee_id,question_id,value").eq("form_id", formId)
        .in("question_id", stayQuestions.map(question => question.id)).order("employee_id").order("question_id").range(from, from + 999);
      if (error) failed(error);
      for (const row of (data ?? []) as { employee_id: string; question_id: string; value: AnswerValue }[]) {
        const own = answers.get(row.employee_id) ?? {};
        own[keyOf.get(row.question_id)!] = row.value;
        answers.set(row.employee_id, own);
      }
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  return people.filter(person => person.active).map(person => stayPerson(person, answers.get(person.id) ?? {}));
}

/* ---- The board (Data HR open) ------------------------------------------------------------------ */

export type StayCard = {
  id: string; name: string; department: string; gender: string | null;
  /** Short facts for HR: bed and wake time, AC, smoke, department wish, habits, roommates named. */
  facts: string[];
};
export type StayRoom = {
  id: string; name: string; kind: string; capacity: number; reviewed: boolean;
  people: StayCard[]; blocked: string[]; notes: string[];
};
export type StayBoard = {
  migrated: boolean;
  publishedAt: string | null;
  rooms: StayRoom[];
  /** Answered the stay section, no room yet. */
  waiting: StayCard[];
  /** Active employees who have not answered "untuk pembagian kamar" yet, and have no room. */
  unanswered: number;
};

function cardOf(person: StayPerson, names: Map<string, string>): StayCard {
  const facts = [
    person.sleep && `Tidur ${person.sleep}`, person.wake && `Bangun ${person.wake}`, person.ac && `AC ${person.ac.toLowerCase()}`,
    person.smoke, person.departmentWish, ...person.habits,
    person.wants.length ? `Ingin sekamar: ${person.wants.map(id => names.get(id) ?? "Tanpa nama").join(", ")}` : null,
  ].filter((fact): fact is string => !!fact);
  return { id: person.id, name: person.name, department: person.department, gender: person.gender, facts };
}

const waitingBoard = (): StayBoard => ({ migrated: false, publishedAt: null, rooms: [], waiting: [], unanswered: 0 });

/** The rooms with their people and what to look at, and who still waits for a room. */
export async function stayBoard(unlock: HrUnlock): Promise<StayBoard> {
  let rooms: RoomRow[], members: MemberRow[], publishedAt: string | null;
  try {
    ({ rooms, members } = await readRooms(unlock.formId));
    publishedAt = await readPublished(unlock.formId);
  } catch (error) {
    if (error instanceof ServiceError && error.message.includes(STAY_MIGRATION)) return waitingBoard();
    throw error;
  }
  const [people, everyone] = await Promise.all([stayPeople(unlock.formId), listPeople()]);
  const names = new Map(everyone.map(person => [person.id, person.name]));
  const byId = new Map(people.map(person => [person.id, person]));
  // Someone placed who has since left the employee list still shows, by name, so the bed is not lost.
  const personOf = (id: string): StayPerson => byId.get(id) ?? stayPerson({ id, name: names.get(id) ?? "Tanpa nama", department: "" }, {});
  const placed = new Set(members.map(member => member.employee_id));
  return {
    migrated: true,
    publishedAt,
    rooms: rooms.map(room => {
      const inRoom = members.filter(member => member.room_id === room.id).map(member => personOf(member.employee_id)).sort((a, b) => a.name.localeCompare(b.name, "id"));
      return { id: room.id, name: room.name, kind: room.kind, capacity: room.capacity, reviewed: !!room.reviewed_at, people: inRoom.map(person => cardOf(person, names)), ...roomNotes(inRoom) };
    }),
    waiting: people.filter(person => person.gender && !placed.has(person.id)).sort((a, b) => a.name.localeCompare(b.name, "id")).map(person => cardOf(person, names)),
    unanswered: people.filter(person => !person.gender && !placed.has(person.id)).length,
  };
}

async function readPublished(formId: string): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().from("cq_forms").select("rooms_published_at").eq("id", formId).maybeSingle();
  if (error) failed(error);
  return (data as { rooms_published_at: string | null } | null)?.rooms_published_at ?? null;
}

/* ---- Changes (Data HR open) --------------------------------------------------------------------- */

/** Adds the pasted rooms after the existing ones; a name already there is refused before anything is added. */
export async function addRooms(unlock: HrUnlock, lines: RoomLine[]): Promise<number> {
  const { rooms } = await readRooms(unlock.formId);
  const taken = new Set(rooms.map(room => room.name.toLowerCase()));
  const repeated = lines.filter(line => taken.has(line.name.toLowerCase())).map(line => line.name);
  if (repeated.length) throw new ServiceError(409, `Kamar ${repeated.slice(0, 5).join(", ")}${repeated.length > 5 ? ", …" : ""} sudah ada.`);
  const start = rooms.reduce((top, room) => Math.max(top, room.sort), 0) + 1;
  const { error } = await createPrivilegedClient().from("cq_stay_rooms").insert(lines.map((line, index) => ({ form_id: unlock.formId, ...line, sort: start + index })));
  if (error) failed(error);
  return lines.length;
}

async function roomOf(unlock: HrUnlock, roomId: string): Promise<RoomRow> {
  const { data, error } = await createPrivilegedClient().from("cq_stay_rooms").select("id,name,kind,capacity,reviewed_at,sort").eq("form_id", unlock.formId).eq("id", roomId).maybeSingle();
  if (error) failed(error);
  if (!data) throw new ServiceError(404, "Kamar tidak ditemukan. Muat ulang halaman.");
  return data as RoomRow;
}

/** Name, kind, capacity, or the "sudah ditinjau" mark of one room. */
export async function updateRoom(unlock: HrUnlock, roomId: string, change: Partial<RoomLine> & { reviewed?: boolean }) {
  await roomOf(unlock, roomId);
  const { reviewed, ...fields } = change;
  const values: Record<string, unknown> = { ...fields };
  if (reviewed !== undefined) values.reviewed_at = reviewed ? new Date().toISOString() : null;
  const { error } = await createPrivilegedClient().from("cq_stay_rooms").update(values).eq("form_id", unlock.formId).eq("id", roomId);
  if (error) failed(error);
}

/** Removes a room; its people go back to waiting. */
export async function deleteRoom(unlock: HrUnlock, roomId: string) {
  await roomOf(unlock, roomId);
  const { error } = await createPrivilegedClient().from("cq_stay_rooms").delete().eq("form_id", unlock.formId).eq("id", roomId);
  if (error) failed(error);
}

const unreview = async (formId: string, roomIds: string[]) => {
  const ids = [...new Set(roomIds)];
  if (!ids.length) return;
  const { error } = await createPrivilegedClient().from("cq_stay_rooms").update({ reviewed_at: null }).eq("form_id", formId).in("id", ids);
  if (error) failed(error);
};

/**
 * Puts one person in a room (null: back to waiting). Refused when the room is full (the database
 * checks too) or holds people with the other "untuk pembagian kamar" answer. Other clashes, a
 * smoker with someone who minds, say, are allowed by hand and show on the room for HR to see.
 */
export async function placePerson(unlock: HrUnlock, employeeId: string, roomId: string | null) {
  const [{ rooms, members }, people] = await Promise.all([readRooms(unlock.formId), stayPeople(unlock.formId)]);
  const person = people.find(item => item.id === employeeId);
  const current = members.find(member => member.employee_id === employeeId);
  if (!person && !current) throw new ServiceError(404, "Karyawan tidak ditemukan atau sudah tidak aktif.");
  const client = createPrivilegedClient();
  if (!roomId) {
    if (!current) return;
    const { error } = await client.from("cq_stay_members").delete().eq("form_id", unlock.formId).eq("employee_id", employeeId);
    if (error) failed(error);
    await unreview(unlock.formId, [current.room_id]);
    return;
  }
  const room = rooms.find(item => item.id === roomId);
  if (!room) throw new ServiceError(404, "Kamar tidak ditemukan. Muat ulang halaman.");
  if (current?.room_id === roomId) return;
  const others = members.filter(member => member.room_id === roomId).map(member => people.find(item => item.id === member.employee_id)).filter((item): item is StayPerson => !!item);
  if (members.filter(member => member.room_id === roomId).length >= room.capacity) throw new ServiceError(409, `Kamar ${room.name} sudah penuh.`);
  if (person) {
    const clash = others.find(other => person.gender && other.gender && person.gender !== other.gender);
    if (clash) throw new ServiceError(409, blocked(person, clash) ?? "Isian pembagian kamar berbeda.");
  }
  const { error } = await client.from("cq_stay_members").upsert(
    { form_id: unlock.formId, employee_id: employeeId, room_id: roomId, placed_by: unlock.actor.id, placed_at: new Date().toISOString() },
    { onConflict: "form_id,employee_id" },
  );
  if (error) failed(error);
  await unreview(unlock.formId, [roomId, ...(current ? [current.room_id] : [])]);
}

/** Fills free beds with a suggestion (see suggestRooms); everyone already placed stays. Returns how many were placed. */
export async function suggestPlacements(unlock: HrUnlock): Promise<number> {
  const [{ rooms, members }, people] = await Promise.all([readRooms(unlock.formId), stayPeople(unlock.formId)]);
  const plan = suggestRooms(people, rooms.map(room => ({ id: room.id, name: room.name, capacity: room.capacity, members: members.filter(member => member.room_id === room.id).map(member => member.employee_id) })));
  if (!plan.length) return 0;
  const now = new Date().toISOString();
  const { error } = await createPrivilegedClient().from("cq_stay_members").insert(plan.map(item => ({ form_id: unlock.formId, employee_id: item.employeeId, room_id: item.roomId, placed_by: null, placed_at: now })));
  if (error) failed(error);
  await unreview(unlock.formId, plan.map(item => item.roomId));
  return plan.length;
}

/** Everyone back to waiting; the rooms stay. */
export async function clearPlacements(unlock: HrUnlock) {
  const client = createPrivilegedClient();
  const { error } = await client.from("cq_stay_members").delete().eq("form_id", unlock.formId);
  if (error) failed(error);
  const { error: roomsError } = await client.from("cq_stay_rooms").update({ reviewed_at: null }).eq("form_id", unlock.formId);
  if (roomsError) failed(roomsError);
}

/** Shows the pairing to participants (or takes it back). Changes after publishing show at once. */
export async function publishRooms(unlock: HrUnlock, publish: boolean): Promise<string | null> {
  const at = publish ? new Date().toISOString() : null;
  const { error } = await createPrivilegedClient().from("cq_forms").update({ rooms_published_at: at }).eq("id", unlock.formId);
  if (error) failed(error);
  return at;
}

/* ---- A participant's own room ------------------------------------------------------------------ */

export type MyRoom = { name: string; kind: string; roommates: { name: string; department: string }[] };

/** My room and roommates, once published; null otherwise, or before the migration. Never anyone's answers. */
export async function myRoom(employeeId: string): Promise<MyRoom | null> {
  const form = await currentForm();
  if (!form || form.status === "draf") return null;
  const client = createPrivilegedClient();
  const published = await client.from("cq_forms").select("rooms_published_at").eq("id", form.id).maybeSingle();
  if (published.error) { if (stayMissing(published.error)) return null; failed(published.error); }
  if (!(published.data as { rooms_published_at: string | null } | null)?.rooms_published_at) return null;
  const mine = await client.from("cq_stay_members").select("room_id").eq("form_id", form.id).eq("employee_id", employeeId).maybeSingle();
  if (mine.error) failed(mine.error);
  const roomId = (mine.data as { room_id: string } | null)?.room_id;
  if (!roomId) return null;
  const [room, members, people] = await Promise.all([
    client.from("cq_stay_rooms").select("name,kind").eq("id", roomId).maybeSingle(),
    client.from("cq_stay_members").select("employee_id").eq("form_id", form.id).eq("room_id", roomId),
    listPeople(),
  ]);
  for (const result of [room, members]) if (result.error) failed(result.error);
  if (!room.data) return null;
  const byId = new Map(people.map(person => [person.id, person]));
  const roommates = ((members.data ?? []) as { employee_id: string }[]).filter(member => member.employee_id !== employeeId)
    .map(member => byId.get(member.employee_id)).filter(person => !!person).map(person => ({ name: person!.name, department: person!.department }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const { name, kind } = room.data as { name: string; kind: string };
  return { name, kind, roommates };
}
