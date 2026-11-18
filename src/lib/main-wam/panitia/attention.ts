import { mainWamPath } from "@/lib/routes";
import type { SilentState } from "../module-state";
import { checkInState, wibDate } from "../rundown";
import type { ModuleSwitches, MwSession } from "../types";
import { clock, count } from "./format";

/*
 * Panitia's cards on Beranda (K01): Kelola (4 shortcuts, Absen only with module Absen QR on) and
 * Perlu perhatian, shown only when there is something: photos reported, people not checked in at a
 * wajib session that has started, a Silent Meeting of today not opened yet. Pure.
 */

export type KelolaTile = { key: "rundown" | "absen" | "pengumuman" | "moderasi"; label: string; href: string; badge?: number };

export function kelolaTiles(modules: ModuleSwitches, reported: number): KelolaTile[] {
  const tiles: KelolaTile[] = [{ key: "rundown", label: "Rundown live", href: mainWamPath.rundownLive() }];
  if (modules.absen) tiles.push({ key: "absen", label: "Absen", href: mainWamPath.attendanceManual() });
  tiles.push({ key: "pengumuman", label: "Pengumuman", href: mainWamPath.announce });
  tiles.push({ key: "moderasi", label: "Moderasi", href: mainWamPath.moderation(), badge: reported > 0 ? reported : undefined });
  return tiles;
}

export type AttentionItem = { key: string; icon: "flag" | "user-check" | "lock"; title: string; sub?: string; href: string };

type Required = { session: Pick<MwSession, "id" | "title">; present: number; expected: number };
type SilentWaiting = { session: Pick<MwSession, "id" | "title" | "startsAt">; day: number };

/** The wajib sessions to watch now: published, with absen, started, and their window still open. */
export function requiredOpen<T extends Pick<MwSession, "status" | "usesAttendance" | "required" | "startsAt" | "endsAt">>(sessions: readonly T[], now: Date): T[] {
  return sessions.filter(session => session.status === "terbit" && session.usesAttendance && session.required
    && Date.parse(session.startsAt) <= now.getTime() && checkInState(session, now) === "buka");
}

/** A Silent Meeting of today that has not opened yet (by the clock or by hand). */
export const silentWaitingToday = (session: Pick<MwSession, "startsAt" | "status">, state: SilentState, now: Date) =>
  session.status === "terbit" && state === "belum" && wibDate(session.startsAt) === wibDate(now.toISOString());

export function attentionItems(input: { modules: ModuleSwitches; reported: number; required: readonly Required[]; silent: readonly SilentWaiting[] }): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (input.reported > 0) items.push({ key: "foto", icon: "flag", title: `${count(input.reported)} foto dilaporkan`, href: mainWamPath.moderation() });
  if (input.modules.absen) {
    for (const { session, present, expected } of input.required) {
      const missing = expected - present;
      if (missing > 0) items.push({ key: `absen-${session.id}`, icon: "user-check", title: `${count(missing)} orang belum absen`, sub: `${session.title} · wajib`, href: mainWamPath.attendanceManual(session.id) });
    }
  }
  if (input.modules.silent) {
    for (const { session, day } of input.silent) {
      const opens = `Buka otomatis ${clock(session.startsAt)}`;
      items.push({
        key: `silent-${session.id}`, icon: "lock", title: "Silent Meeting belum dibuka", href: `${mainWamPath.rundownLive(day)}#sesi-${session.id}`,
        sub: session.title === "Silent Meeting" ? opens : `${session.title} · ${opens.toLowerCase()}`,
      });
    }
  }
  return items;
}

/** A session that is on now, for the line "Sedang berjalan" on the Panitia hub. */
export type RunningSession = { id: string; title: string; place: string; time: string; href: string };

/** Published sessions that have started and not ended (a session with no end counts for 2 hours), at most 3, earliest first. */
export function runningSessions(sessions: readonly Pick<MwSession, "id" | "title" | "place" | "status" | "startsAt" | "endsAt">[], now: Date): RunningSession[] {
  const at = now.getTime();
  return sessions
    .filter(session => session.status === "terbit" && Date.parse(session.startsAt) <= at && at < (session.endsAt ? Date.parse(session.endsAt) : Date.parse(session.startsAt) + 2 * 3_600_000))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 3)
    .map(session => ({ id: session.id, title: session.title, place: session.place, time: `${clock(session.startsAt)}${session.endsAt ? `–${clock(session.endsAt)}` : ""}`, href: mainWamPath.rundownLive() + `#sesi-${session.id}` }));
}
