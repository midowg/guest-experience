import { timeRange, wibDate } from "../rundown";
import type { MainWamViewer, MwSession, ViewerRoom } from "../types";
import { t, type Lang } from "../i18n";
import { dayOf, dayTime, hhmm } from "./format";

/*
 * Saya (P05/P05B) and Kamar (L01): the profile line and the room with everyone in it (any number).
 * The kelompok are gone from the app (revisi 18 Nov). Colleagues by nama panggilan. Pure.
 */

/** The profile card's second line: the department ("CoE"). */
export function profileLine(viewer: Pick<MainWamViewer, "department">): string {
  return viewer.department.trim();
}

/** The others in the room, as Saya says it: "bersama Sari, Dewi", "bersama Gilang, Raka, dan 2 lainnya", or "Sendiri". */
export function roomWith(room: Pick<ViewerRoom, "people">, lang: Lang = "id"): string {
  const others = room.people.filter(person => !person.me).map(person => person.name);
  if (!others.length) return t(lang, "peserta.room.alone");
  if (others.length <= 2) return t(lang, "peserta.room.withTwo", { names: others.join(", ") });
  return t(lang, "peserta.room.withMore", { names: others.slice(0, 2).join(", "), n: others.length - 2 });
}

/** Saya's room row: "Kamar 208" · "3 orang · bersama Sari, Dewi" (alone: "Sendiri"). */
export function roomRow(room: ViewerRoom, lang: Lang = "id"): { title: string; sub: string } {
  const count = room.people.length;
  const others = roomWith(room, lang);
  const alone = t(lang, "peserta.room.alone");
  return { title: t(lang, "peserta.room.room", { name: room.name }), sub: others === alone || count <= 1 ? alone : t(lang, "peserta.room.roomRowSub", { count, others }) };
}

/** L01's room head: "Lantai 2 · 3 orang". */
export const roomSub = (room: ViewerRoom, lang: Lang = "id") => [room.floor.trim(), t(lang, "fmt.people", { n: room.people.length })].filter(Boolean).join(" · ");

/** "Sen, 4 Jan · 15.30" for check-in and check-out; "" when not set. */
export const stayTime = (iso: string | null, lang: Lang = "id") => (iso ? dayTime(iso, lang) : "");

/** A session's time for lists: "Sel, 5 Jan · 08.00–12.00". */
export const sessionWhen = (session: Pick<MwSession, "startsAt" | "endsAt">, lang: Lang = "id") => `${dayOf(session.startsAt, lang)} · ${timeRange(session, lang)}`;

/** "15.30" on the day of the event start, else with the day. */
export const timeOn = (iso: string, date: string, lang: Lang = "id") => (wibDate(iso) === date ? hhmm(iso, lang) : dayTime(iso, lang));
