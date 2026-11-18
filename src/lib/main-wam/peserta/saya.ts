import { timeRange, wibDate } from "../rundown";
import type { ActivityGroupKind, MainWamViewer, MwActivityGroup, MwGroup, MwPerson, MwSession, ViewerRoom } from "../types";
import { t, type Lang } from "../i18n";
import { dayOf, dayTime, hhmm } from "./format";

/*
 * Saya (P05/P05B) and Kelompok & kamar (L01, revisi 16 Nov malam): the profile line, the room with
 * everyone in it (any number), the kelompok (coordinator first, then you), and the kelompok
 * kegiatan per session. Colleagues by nama panggilan. Pure.
 */

/** "CoE · Kelompok 4 · Arjuno"; BOD without a kelompok: "BOD". */
export function profileLine(viewer: Pick<MainWamViewer, "department" | "group">, lang: Lang = "id"): string {
  return [viewer.department.trim(), viewer.group ? t(lang, "peserta.group.title", { number: viewer.group.number, name: viewer.group.name }) : ""].filter(Boolean).join(" · ");
}

/** The others in the room, as Saya says it: "bersama Sari, Dewi", "bersama Gilang, Raka, dan 2 lainnya", or "Sendiri". */
export function roomWith(room: Pick<ViewerRoom, "people">, lang: Lang = "id"): string {
  const others = room.people.filter(person => !person.me).map(person => person.name);
  if (!others.length) return t(lang, "peserta.group.alone");
  if (others.length <= 2) return t(lang, "peserta.group.withTwo", { names: others.join(", ") });
  return t(lang, "peserta.group.withMore", { names: others.slice(0, 2).join(", "), n: others.length - 2 });
}

/** Saya's room row: "Kamar 208" · "3 orang · bersama Sari, Dewi" (alone: "Sendiri"). */
export function roomRow(room: ViewerRoom, lang: Lang = "id"): { title: string; sub: string } {
  const count = room.people.length;
  const others = roomWith(room, lang);
  const alone = t(lang, "peserta.group.alone");
  return { title: t(lang, "peserta.group.room", { name: room.name }), sub: others === alone || count <= 1 ? alone : t(lang, "peserta.group.roomRowSub", { count, others }) };
}

/** L01's room head: "Lantai 2 · 3 orang". */
export const roomSub = (room: ViewerRoom, lang: Lang = "id") => [room.floor.trim(), t(lang, "fmt.people", { n: room.people.length })].filter(Boolean).join(" · ");

export type MemberRow = { id: string; name: string; department: string; photo: string | null; coordinator: boolean; me: boolean; label: string };

/**
 * The kelompok's members: the coordinator first, then you, then the others in Admin WAM's order
 * (L01). "Fajar · Koordinator", "Rani (kamu)". Someone no longer in Data karyawan is left out.
 */
export function memberRows(group: MwGroup, people: ReadonlyMap<string, MwPerson>, viewerId: string, lang: Lang = "id"): MemberRow[] {
  return group.members.flatMap(member => {
    const person = people.get(member.employeeId);
    if (!person) return [];
    const me = person.id === viewerId;
    const label = member.coordinator ? `${person.name} · ${t(lang, "peserta.group.coordinator")}${me ? t(lang, "peserta.group.youShort") : ""}` : me ? t(lang, "peserta.group.you", { name: person.name }) : person.name;
    return [{ id: person.id, name: person.name, department: person.department, photo: person.photo ?? null, coordinator: member.coordinator, me, label }];
  }).sort((a, b) => Number(b.coordinator) - Number(a.coordinator) || Number(b.me) - Number(a.me));
}

/** How many members show before "5 lainnya". */
export const MEMBERS_SHOWN = 5;

export type ActivityRow = { id: string; sessionId: string; kind: ActivityGroupKind; title: string; sub: string };

/**
 * "Team building · Pos 2" · "Sel, 5 Jan · 15.00 · Lawn" (a note, when there is one, instead of
 * the place: "Rab, 6 Jan · kumpul lobby 05.45"), in the order of the sessions.
 */
export function activityRows(groups: readonly MwActivityGroup[], sessions: readonly MwSession[], lang: Lang = "id"): ActivityRow[] {
  const byId = new Map(sessions.filter(session => session.status !== "draf").map(session => [session.id, session]));
  return groups.flatMap(group => {
    const session = byId.get(group.sessionId);
    if (!session) return [];
    const note = group.note.trim();
    const sub = note ? `${dayOf(session.startsAt, lang)} · ${note.charAt(0).toLowerCase()}${note.slice(1)}` : [dayTime(session.startsAt, lang), session.place.trim()].filter(Boolean).join(" · ");
    return [{ id: group.id, sessionId: session.id, kind: group.kind, title: `${session.title} · ${group.label}`, sub, at: session.startsAt }];
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(({ at: _at, ...row }) => { void _at; return row; });
}

/** "Sen, 4 Jan · 15.30" for check-in and check-out; "" when not set. */
export const stayTime = (iso: string | null, lang: Lang = "id") => (iso ? dayTime(iso, lang) : "");

/** A session's time for lists: "Sel, 5 Jan · 08.00–12.00". */
export const sessionWhen = (session: Pick<MwSession, "startsAt" | "endsAt">, lang: Lang = "id") => `${dayOf(session.startsAt, lang)} · ${timeRange(session, lang)}`;

/** "15.30" on the day of the event start, else with the day. */
export const timeOn = (iso: string, date: string, lang: Lang = "id") => (wibDate(iso) === date ? hhmm(iso, lang) : dayTime(iso, lang));
