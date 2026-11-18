import "server-only";
import { demoSample } from "@/lib/main-wam/demo-sample";
import { sampleSessions } from "@/lib/main-wam/sample";
import { silentShownCount, silentState, type SilentResult } from "@/lib/main-wam/module-state";
import { clock, shortDate } from "@/lib/main-wam/panitia/format";
import { describeChange, liveOfDay, planShift, scheduleNotice, type LiveSession } from "@/lib/main-wam/panitia/rundown";
import type { RundownChangeInput } from "@/lib/main-wam/panitia/schemas";
import { agendaDay, eventDates, timeRange, wibDate } from "@/lib/main-wam/rundown";
import { SESSION_COLUMNS, sessionFromRow } from "@/lib/main-wam/rows";
import type { MwSession } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { demoRundown } from "../demo";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamAudience, sendMainWamNote } from "../notes";
import { mainWamPeople } from "../people";
import { rundownLog, silentQuestions, silentResults } from "../read";
import { db } from "./common";

/*
 * Rundown live (K02) and Ubah jam (K03) on the server. Every save goes through mw_rundown_change
 * (migration 202611200301): one transaction for the session and the ones that move with it, each
 * checked against the version the panitia saw, "diubah <nama> · jam" stamped and Riwayat perubahan
 * written. "Kabari peserta" sends one note through fondasi's sendMainWamNote, tagged sesi-<id> so a
 * newer one replaces it on a phone.
 */

export const PANITIA_MIGRATION = "202611200301_main_wam_panitia.sql";
export const waitingUpdate = () => new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Coba lagi nanti.");

type VersionedSession = MwSession & { version: string };

/** Every session with its version (updated_at); drafts too (the caller leaves them out). */
async function sessionsWithVersion(): Promise<{ data: VersionedSession[]; migrated: boolean }> {
  const { data, error } = await db().from("mw_sessions").select(`${SESSION_COLUMNS},updated_at`).order("starts_at").order("sort").limit(500);
  if (error) {
    if (mwMissing(error) && !(await demoRundown())) return { data: [], migrated: false };
    if (!mwMissing(error)) databaseError(error);
  }
  const real = ((data ?? []) as Record<string, unknown>[]).map(row => ({ ...sessionFromRow(row), version: String(row.updated_at ?? "") }));
  // Mode demo with the sample rundown: its sessions (their version is only a label: every write is refused, gate.ts).
  if (!real.some(session => session.status !== "draf") && await demoRundown()) return { data: demoSample(sampleSessions).map(session => ({ ...session, version: "demo" })), migrated: true };
  return { data: real, migrated: true };
}

export type RundownDay = { key: string; day: string; date: string; today: boolean; href: string };
export type RundownHistory = { id: string; title: string; text: string; by: string | null; at: string; notified: boolean; recipients: number };
export type RundownLiveData = {
  migrated: boolean;
  day: number;
  days: RundownDay[];
  sessions: LiveSession[];
  history: RundownHistory[];
  /** "Notifikasi ke 122 orang". */
  recipients: number;
  now: string;
};

/** The day tabs of the event (1–4), today marked; `link` builds each tab's address. */
export function eventDayTabs(event: MainWamContext["settings"]["event"], now: Date, link: (day: number) => string): RundownDay[] {
  const today = wibDate(now.toISOString());
  return eventDates(event).map((date, index) => ({ key: String(index + 1), day: `Hari ${index + 1}`, date: shortDate(date), today: date === today, href: link(index + 1) }));
}

/** What Rundown live shows for a day (1–4; none = today, else the first or last day). */
export async function rundownLiveData(context: MainWamContext, asked: string | number | undefined, now = new Date()): Promise<RundownLiveData> {
  const { settings } = context;
  const day = agendaDay(asked, wibDate(now.toISOString()), settings.event);
  const date = eventDates(settings.event)[day - 1];
  const [sessions, people, log, audience, questions, results] = await Promise.all([
    sessionsWithVersion(), mainWamPeople(), rundownLog(undefined, 50),
    mainWamAudience(settings).then(ids => ids.length).catch(() => 0),
    settings.modules.silent ? silentQuestions() : Promise.resolve({ data: [], migrated: true }),
    // Counts of closed Silent Meetings only (never of an open one, audit H2).
    settings.modules.silent ? silentResults().catch(() => ({ data: new Map<string, SilentResult>(), migrated: false })) : Promise.resolve({ data: new Map<string, SilentResult>(), migrated: true }),
  ]);
  const nameOf = (id: string | null) => (id ? people.get(id)?.name ?? null : null);
  const ofDay = date ? liveOfDay(sessions.data, date) : [];
  const titles = new Map(sessions.data.map(session => [session.id, session.title]));
  return {
    migrated: sessions.migrated, day, now: now.toISOString(), recipients: audience,
    days: eventDayTabs(settings.event, now, mainWamPath.rundownLive),
    sessions: ofDay.map(session => {
      const question = settings.modules.silent && session.module === "silent" ? questions.data.find(item => item.sessionId === session.id) : undefined;
      return {
        id: session.id, title: session.title, kind: session.kind, status: session.status, startsAt: session.startsAt, endsAt: session.endsAt,
        place: session.place, optional: session.optional, changedAt: session.changedAt, version: session.version, changedByName: nameOf(session.changedBy),
        silent: question ? { questionId: question.id, state: silentState(question, session, now), count: silentShownCount(results.data.get(question.id)) } : null,
      };
    }),
    history: log.data.map(entry => ({
      id: entry.id, title: titles.get(entry.sessionId) ?? "Sesi", text: describeChange(entry), by: nameOf(entry.changedBy), at: entry.changedAt, notified: entry.notified, recipients: entry.recipients,
    })),
  };
}

const NOTICE_TITLE: Record<RundownChangeInput["action"], string> = { jam: "Jadwal berubah", tempat: "Tempat berubah", batal: "Sesi dibatalkan", kembali: "Sesi dijadwalkan lagi" };

/** Why a save was refused, in words, from the database's answer. */
async function refusal(error: { message?: string; code?: string; details?: string }, sessionId: string): Promise<never> {
  if (mwMissing(error)) throw waitingUpdate();
  if (error.message === "RUNDOWN_CHANGED") {
    const changed = error.details && /^[0-9a-f-]{36}$/i.test(error.details) ? error.details : sessionId;
    const { data } = await db().from("mw_sessions").select("changed_by").eq("id", changed).maybeSingle();
    const by = data?.changed_by ? (await mainWamPeople()).get(data.changed_by as string)?.name : null;
    throw new ServiceError(409, `Jadwal ini baru saja diubah${by ? ` ${by}` : ""}. Muat ulang untuk melihat jam terbaru.`);
  }
  if (error.message === "RUNDOWN_GONE") throw new ServiceError(404, "Sesi ini sudah tidak ada. Muat ulang halaman.");
  if (error.message === "RUNDOWN_INVALID") throw new ServiceError(422, "Perubahan ini tidak bisa disimpan. Muat ulang halaman.");
  if (error.code === "23514") throw new ServiceError(422, "Jam selesai harus setelah jam mulai.");
  return databaseError({ message: error.message ?? "", code: error.code });
}

/**
 * One change from Rundown live, by a panitia: Ubah jam (with the sessions that move with it),
 * Pindah tempat, Batalkan sesi, Kembalikan sesi. The same plan as the sheet is checked again here
 * (a clash is refused). Returns how many got the note (0 without "Kabari peserta").
 */
export type RundownChangeResult = { changed: number; notified: boolean; recipients: number; versions: Record<string, string> };

export async function changeSession(context: MainWamContext, id: string, input: RundownChangeInput): Promise<RundownChangeResult> {
  const { data: all, migrated } = await sessionsWithVersion();
  if (!migrated) throw waitingUpdate();
  const session = all.find(item => item.id === id);
  if (!session || session.status === "draf") throw new ServiceError(404, "Sesi ini sudah tidak ada. Muat ulang halaman.");

  type Item = { id: string; version: string; startsAt?: string; endsAt?: string | null; place?: string; status?: "terbit" | "batal" };
  let items: Item[];
  let notice: { title: string; startsAt: string; endsAt: string | null }[] = [];
  switch (input.action) {
    case "jam": {
      if (session.status !== "terbit") throw new ServiceError(409, "Sesi yang dibatalkan tidak bisa diubah jamnya.");
      if (wibDate(input.startsAt) !== wibDate(session.startsAt)) throw new ServiceError(422, "Jam baru harus di hari yang sama.");
      const sameDay = liveOfDay(all, wibDate(session.startsAt));
      const versions = new Map(input.shift.map(item => [item.id, item.version]));
      const plan = planShift(session, sameDay, { start: clock(input.startsAt), end: input.endsAt ? clock(input.endsAt) : "" }, new Set(versions.keys()));
      const clash = plan.rows.find(row => row.clash);
      if (plan.error || clash) throw new ServiceError(422, plan.error ?? `Bentrok dengan ${clash!.title} ${clash!.was}. Centang atau ubah jamnya.`);
      if (!plan.changed || !plan.startsAt) return { changed: 0, notified: false, recipients: 0, versions: {} };
      items = [{ id, version: input.version, startsAt: plan.startsAt, endsAt: plan.endsAt },
        ...plan.moved.map(move => ({ id: move.id, version: versions.get(move.id)!, startsAt: move.startsAt, endsAt: move.endsAt }))];
      notice = [{ title: session.title, startsAt: plan.startsAt, endsAt: plan.endsAt }, ...plan.moved.map(move => ({ title: all.find(item => item.id === move.id)!.title, startsAt: move.startsAt, endsAt: move.endsAt }))];
      break;
    }
    case "tempat": items = [{ id, version: input.version, place: input.place }]; break;
    case "batal": items = [{ id, version: input.version, status: "batal" }]; break;
    case "kembali": items = [{ id, version: input.version, status: "terbit" }]; break;
  }

  const { data, error } = await db().rpc("mw_rundown_change", { p_by: context.viewer.id, p_items: items, p_notified: input.notify });
  if (error) return refusal(error, id);
  const saved = (data ?? []) as { out_session: string; out_log: string; out_version: string }[];
  const versions = Object.fromEntries(saved.map(row => [row.out_session, row.out_version]));
  if (!saved.length || !input.notify) return { changed: saved.length, notified: false, recipients: 0, versions };

  const range = `${shortDate(wibDate(session.startsAt))} ${timeRange(session)}`;
  const body = input.action === "jam" ? scheduleNotice(notice)
    : input.action === "tempat" ? `${session.title} pindah ke ${input.place}.`
      : input.action === "batal" ? `${session.title} (${range}) dibatalkan.`
        : `${session.title} kembali dijadwalkan ${range}.`;
  let recipients = 0;
  try {
    recipients = await sendMainWamNote({
      kind: "jadwal", title: NOTICE_TITLE[input.action], body, to: { audience: { type: "semua" } }, link: mainWamPath.session(id), by: context.viewer.id, tag: `sesi-${id}`,
    });
  } catch { /* the change is saved; the note is not (the toast says so) */ }
  if (recipients) await db().from("mw_rundown_log").update({ recipients }).in("id", saved.map(row => row.out_log));
  return { changed: saved.length, notified: recipients > 0, recipients, versions };
}

/** Riwayat perubahan for the API (newest first). */
export async function rundownHistory(): Promise<{ migrated: boolean; history: RundownHistory[] }> {
  const [log, sessions, people] = await Promise.all([rundownLog(undefined, 100), sessionsWithVersion(), mainWamPeople()]);
  const titles = new Map(sessions.data.map(session => [session.id, session.title]));
  return {
    migrated: log.migrated,
    history: log.data.map(entry => ({
      id: entry.id, title: titles.get(entry.sessionId) ?? "Sesi", text: describeChange(entry), by: entry.changedBy ? people.get(entry.changedBy)?.name ?? null : null,
      at: entry.changedAt, notified: entry.notified, recipients: entry.recipients,
    })),
  };
}
