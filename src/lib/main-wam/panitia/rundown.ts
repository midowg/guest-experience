import type { SilentState } from "../module-state";
import { hasEnded, isRunning, sessionEnd, timeRange, wibDate, wibInstant } from "../rundown";
import type { MwSession, RundownChange, SessionKind, SessionStatus } from "../types";
import { clock, clockMinutes, formatMinutes, parseClock, signedDuration } from "./format";

/*
 * Rundown live (K02) and Ubah jam (K03): what a row shows and offers, and how a new time moves the
 * sessions after it ("sesi berikutnya ikut bergeser"). The server checks the same plan before it
 * saves (src/lib/server/main-wam/panitia/rundown.ts), so the rules live here once. Pure.
 */

/** A session as Rundown live shows it: its version (updated_at) for a save that must not overwrite someone else's. */
export type LiveSession = Pick<MwSession, "id" | "title" | "kind" | "status" | "startsAt" | "endsAt" | "place" | "optional" | "changedAt"> & {
  version: string;
  /** Who changed it last in Rundown live (nama panggilan), with changedAt. */
  changedByName: string | null;
  /** Its Silent Meeting while module silent is on. */
  silent: LiveSilent | null;
};
export type LiveSilent = { questionId: string; state: SilentState; count: number; override: "buka" | "tutup" | null };

export type RowState = "cancelled" | "done" | "live" | "upcoming";
export function rowState(session: Pick<MwSession, "status" | "startsAt" | "endsAt">, now: Date): RowState {
  if (session.status === "batal") return "cancelled";
  if (hasEnded(session, now)) return "done";
  return isRunning(session, now) ? "live" : "upcoming";
}

/** The Silent Meeting button of a row: Buka before or while it is closed within its hours, Tutup while open. */
export function silentAction(silent: LiveSilent, session: Pick<MwSession, "startsAt" | "endsAt" | "status">, now: Date): "buka" | "tutup" | null {
  if (session.status !== "terbit") return null;
  if (silent.state === "buka") return "tutup";
  if (silent.state === "belum") return "buka";
  return now.getTime() < Date.parse(sessionEnd(session)) ? "buka" : null;
}

/** "Belum dibuka", "Dibuka · 41 masukan", "Ditutup · 47 masukan". */
export function silentLabel(silent: LiveSilent): string {
  if (silent.state === "belum") return "Belum dibuka";
  return `${silent.state === "buka" ? "Dibuka" : "Ditutup"} · ${silent.count} masukan`;
}

/* ── Ubah jam ─────────────────────────────────────────────────────────────────────────────────── */

type Timed = Pick<MwSession, "id" | "title" | "startsAt" | "endsAt" | "status">;
const ms = (iso: string) => Date.parse(iso);
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const span = (session: Pick<MwSession, "startsAt" | "endsAt">) => ({ start: ms(session.startsAt), end: ms(sessionEnd(session)) });

/** The sessions of the same day that can move with it: published, starting at or after it. */
export function laterSessions<T extends Timed>(session: Timed, sameDay: readonly T[]): T[] {
  return sameDay.filter(other => other.id !== session.id && other.status === "terbit" && ms(other.startsAt) >= ms(session.startsAt))
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
}

export type ShiftRow = { id: string; title: string; checked: boolean; was: string; becomes: string; clash: boolean };
export type ShiftPlan = {
  /** The typed times, or null while one does not read as a time. */
  startsAt: string | null;
  endsAt: string | null;
  /** How far the sessions after it move (end to end; start to start for a moment without an end). */
  delta: number;
  /** "Tadinya 08.00–12.00 · +30 menit". */
  help: string;
  /** "Sesi berikutnya ikut bergeser +30 menit" (null when nothing moves). */
  shiftLabel: string | null;
  rows: ShiftRow[];
  /** Under the time fields. */
  error: string | null;
  /** Under a time field: which one. */
  errorField: "start" | "end" | null;
  /** The sessions that move with it (their ids), and their new times. */
  moved: { id: string; startsAt: string; endsAt: string | null }[];
  changed: boolean;
  ok: boolean;
};

const shifted = (iso: string | null, delta: number) => (iso ? new Date(ms(iso) + delta).toISOString() : null);

/**
 * The sessions after it that move by default: each one the moved block now runs into, one after
 * another (12.00–12.30 runs into Makan siang 12.00, which then runs into Silent Meeting 13.00…).
 * A session that already ran alongside it (parallel) is left alone.
 */
export function defaultShift(session: Timed, later: readonly Timed[], startsAt: string, endsAt: string | null, delta: number): Set<string> {
  const checked = new Set<string>();
  if (delta <= 0) return checked;
  const original = span(session);
  let edge = ms(sessionEnd({ startsAt, endsAt }));
  for (const other of later) {
    const own = span(other);
    if (overlaps(own, original)) continue;
    if (own.start >= edge) break;
    checked.add(other.id);
    edge = Math.max(edge, own.end + delta);
  }
  return checked;
}

/**
 * The plan for typed times ("08.00", "12.30") on the session's WIB day: the new times, how far the
 * later sessions move, which of them move (`checked`), and what clashes. A session that did not run
 * alongside a moved one before and does now is a clash: "Bentrok. Centang atau ubah jamnya."
 * (`checked: null` = the default plan.)
 */
export function planShift<T extends Timed>(session: T, sameDay: readonly T[], typed: { start: string; end: string }, checked: ReadonlySet<string> | null): ShiftPlan {
  const date = wibDate(session.startsAt);
  const later = laterSessions(session, sameDay);
  const was = timeRange(session);
  const startMinutes = parseClock(typed.start);
  const endMinutes = session.endsAt || typed.end.trim() ? parseClock(typed.end) : null;
  const empty: ShiftPlan = { startsAt: null, endsAt: null, delta: 0, help: `Tadinya ${was}`, shiftLabel: null, rows: [], error: null, errorField: null, moved: [], changed: false, ok: false };
  if (startMinutes === null) return { ...empty, error: "Tulis jam seperti 08.00.", errorField: "start" };
  if ((session.endsAt || typed.end.trim()) && endMinutes === null) return { ...empty, error: "Tulis jam seperti 12.30.", errorField: "end" };
  if (endMinutes !== null && endMinutes <= startMinutes) return { ...empty, error: "Jam selesai harus setelah jam mulai.", errorField: "end" };

  const startsAt = new Date(wibInstant(date, formatMinutes(startMinutes).replace(".", ":"))).toISOString();
  const endsAt = endMinutes === null ? null : new Date(wibInstant(date, formatMinutes(endMinutes).replace(".", ":"))).toISOString();
  const delta = session.endsAt && endsAt ? ms(endsAt) - ms(session.endsAt) : ms(startsAt) - ms(session.startsAt);
  const changed = startsAt !== new Date(session.startsAt).toISOString() || (endsAt ?? null) !== (session.endsAt ? new Date(session.endsAt).toISOString() : null);
  const chosen = checked ?? defaultShift(session, later, startsAt, endsAt, delta);
  const movesOthers = delta !== 0;

  const moved = movesOthers ? later.filter(other => chosen.has(other.id)).map(other => ({ id: other.id, startsAt: shifted(other.startsAt, delta)!, endsAt: shifted(other.endsAt, delta) })) : [];
  const blocks = [{ id: session.id, old: span(session), now: span({ startsAt, endsAt }) }, ...moved.map(move => {
    const other = later.find(item => item.id === move.id)!;
    return { id: move.id, old: span(other), now: span(move) };
  })];
  const clashesWith = (other: T) => {
    const own = span(other);
    return blocks.some(block => block.id !== other.id && overlaps(block.now, own) && !overlaps(block.old, own));
  };

  const allRows: ShiftRow[] = movesOthers ? later.map(other => {
    const isChecked = chosen.has(other.id);
    const move = moved.find(item => item.id === other.id);
    return {
      id: other.id, title: other.title, checked: isChecked, was: timeRange(other),
      becomes: move ? timeRange(move) : timeRange(other), clash: !isChecked && clashesWith(other),
    };
  }) : [];
  // Shown: every session that moves or clashes, and the first one after them that stays.
  const lastChecked = allRows.findLastIndex(row => row.checked), lastClash = allRows.findLastIndex(row => row.clash);
  const rows = allRows.slice(0, Math.max(lastChecked + 1, lastClash) + 1);
  // An earlier session (not in the list) the new time runs into.
  const before = sameDay.filter(other => other.id !== session.id && other.status === "terbit" && !later.includes(other)).find(other => clashesWith(other));
  const error = before ? `Bentrok dengan ${before.title} ${timeRange(before)}.` : null;
  const ok = changed && !error && allRows.every(row => !row.clash);
  const shift = signedDuration(delta);
  return {
    startsAt, endsAt, delta, changed, ok, moved, rows, error, errorField: error ? "start" : null,
    help: changed && delta !== 0 ? `Tadinya ${was} · ${shift}` : `Tadinya ${was}`,
    shiftLabel: movesOthers && rows.length ? `Sesi berikutnya ikut bergeser ${shift}` : null,
  };
}

/** What the change notice says: "Pemaparan departemen 08.00–12.30. Makan siang 12.30–13.30." */
export function scheduleNotice(items: { title: string; startsAt: string; endsAt: string | null }[]): string {
  return items.map(item => `${item.title} ${timeRange(item)}.`).join(" ").slice(0, 300);
}

/* ── Riwayat perubahan ────────────────────────────────────────────────────────────────────────── */

/** One line of a change: "Jam 08.00–12.30, tadinya 08.00–12.00", "Tempat Lawn, tadinya Aula Utama", "Dibatalkan". */
export function describeChange(change: RundownChange): string {
  const of = (field: string) => change.changes.find(item => item.field === field);
  const parts: string[] = [];
  const start = of("startsAt"), end = of("endsAt");
  const at = (iso: string | null | undefined) => (iso ? clock(iso) : "–");
  if (start && end) parts.push(`Jam ${at(start.to)}–${at(end.to)}, tadinya ${at(start.from)}–${at(end.from)}`);
  else if (start) parts.push(`Mulai ${at(start.to)}, tadinya ${at(start.from)}`);
  else if (end) parts.push(`Selesai ${at(end.to)}, tadinya ${at(end.from)}`);
  const place = of("place");
  if (place) parts.push(place.to ? `Tempat ${place.to}${place.from ? `, tadinya ${place.from}` : ""}` : "Tempat dikosongkan");
  const status = of("status");
  if (status) parts.push(status.to === "batal" ? "Dibatalkan" : "Dijadwalkan lagi");
  return parts.join(". ");
}

/** For Rundown live: the day's sessions minus drafts, in order (cancelled kept, struck through). */
export function liveOfDay<T extends { status: SessionStatus; startsAt: string; sort?: number; title: string; kind?: SessionKind }>(sessions: readonly T[], date: string): T[] {
  return sessions.filter(session => session.status !== "draf" && wibDate(session.startsAt) === date)
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt) || (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title, "id"));
}

/** The minutes of a session's start and end on its own day (for the fields of Ubah jam). */
export const typedTimes = (session: Pick<MwSession, "startsAt" | "endsAt">) => ({ start: formatMinutes(clockMinutes(session.startsAt)), end: session.endsAt ? formatMinutes(clockMinutes(session.endsAt)) : "" });
