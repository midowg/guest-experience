import { pickHomeCard, type HomeCardCandidate } from "../home-card";
import { noteTone } from "../notify";
import { silentClosesAt, silentState, votingState } from "../module-state";
import { checkInWindow, dayWord, eventDay, hasEnded, isLive, isRunning, nowCard, sessionEnd, timeRange, wibDate, type NowCard } from "../rundown";
import type { MainWamEventInfo, ModuleSwitches, MwAwardCategory, MwNotification, MwSession, MwSilentQuestion, MwTrip, MwTripSeat, NoteTone } from "../types";
import { hhmm, untilLabel } from "./format";
import type { SurveyOpen } from "./survey";

/*
 * Beranda (P01/P02, revisi 16 Nov): at most four blocks: the head (the shell's), the Sekarang card,
 * one contextual card, the Momen card (agen B). This file turns what the server read into what the
 * two cards show, so the page, its API and the previews say the same. Pure.
 */

/* ── Sekarang ─────────────────────────────────────────────────────────────────────────────────── */

export type NowView =
  | {
    kind: "sesi";
    sessionId: string;
    title: string;
    /** "08.00–12.00". */
    time: string;
    place: string;
    /** The pill on the left: Berikutnya, Sedang berlangsung, Hadir 07.52, or Selesai (ended, absen still open). */
    status: "next" | "live" | "present" | "done";
    /** Words of the pill when it says more than its preset ("Hadir 07.52"). */
    statusText: string | null;
    /** The caption on the right: "20 menit lagi" (or "Hadir 07.52" beside a live pill). */
    when: string | null;
    /** The instant "20 menit lagi" counts to (the screen keeps counting); null for words that do not change. */
    whenAt: string | null;
    /** Absen is open and the person has not checked in: the card carries agen D's Absen (SessionAbsen). */
    absen: boolean;
  }
  /** Today is done; tomorrow's first session ("Besok 06.00 · Trekking Coban Rondo") and its Agenda day. */
  | { kind: "selesai"; tomorrow: { title: string; when: string; day: number | null } | null }
  /** Nothing published yet. */
  | { kind: "kosong" };

export type NowInput = {
  sessions: readonly MwSession[];
  now: Date;
  event: Pick<MainWamEventInfo, "startDate" | "endDate">;
  /** Module Absen QR is on and the person checks in (not BOD). Off: no Absen, no "Hadir" anywhere. */
  absenOn: boolean;
  /** The person's check-ins: session id → when. */
  checkedIn: ReadonlyMap<string, string>;
};

/** The Sekarang card (nowCard of the fondasi, in the card's words). */
export function nowView({ sessions, now, event, absenOn, checkedIn }: NowInput): NowView {
  const attended = absenOn ? checkedIn : new Map<string, string>();
  const card: NowCard = mealGivesWay(nowCard(sessions, now, { absenOn, checkedIn: new Set(attended.keys()) }), sessions, now);
  if (card.kind === "kosong") return { kind: "kosong" };
  if (card.kind === "selesai") {
    const next = card.tomorrow;
    if (!next) return { kind: "selesai", tomorrow: null };
    const today = wibDate(now.toISOString()), date = wibDate(next.startsAt);
    const word = dayWord(date, today);
    return { kind: "selesai", tomorrow: { title: next.title, when: word === "Besok" ? `Besok ${hhmm(next.startsAt)}` : `${word} · ${hhmm(next.startsAt)}`, day: eventDay(date, event)?.day ?? null } };
  }
  const session = card.session;
  const at = attended.get(session.id) ?? null;
  const running = isRunning(session, now);
  const base = { kind: "sesi" as const, sessionId: session.id, title: session.title, time: timeRange(session), place: placeLine(session) };
  if (card.kind === "absen") {
    // Ended, but absen stays open 30 minutes more: say until when.
    if (hasEnded(session, now)) return { ...base, status: "done", statusText: null, when: `Absen sampai ${hhmm(checkInWindow(session).closes)}`, whenAt: null, absen: true };
    return { ...base, status: running ? "live" : "next", statusText: null, when: running ? null : untilLabel(now, session.startsAt), whenAt: running ? null : session.startsAt, absen: true };
  }
  if (card.kind === "berlangsung") {
    return { ...base, status: "live", statusText: null, when: at ? `Hadir ${hhmm(at)}` : null, whenAt: null, absen: false };
  }
  return at
    ? { ...base, status: "present", statusText: `Hadir ${hhmm(at)}`, when: untilLabel(now, session.startsAt), whenAt: session.startsAt, absen: false }
    : { ...base, status: "next", statusText: null, when: untilLabel(now, session.startsAt), whenAt: session.startsAt, absen: false };
}

/** How soon a real session must start to take the card from a meal that is on (P01__status: 07.10 Pemaparan, not Sarapan). */
export const MEAL_GIVES_WAY_MINUTES = 90;

/**
 * "Sesi makan tidak dipilih bila ada sesi beraksi" (SPEC P01): while only a meal runs or comes
 * next, the first real session (not a meal) starting today within 90 minutes takes the card, so
 * breakfast at 07.10 shows "Pemaparan departemen · 50 menit lagi". An open absen keeps the card.
 */
export function mealGivesWay<T extends MwSession>(card: NowCard<T>, sessions: readonly T[], now: Date): NowCard<T> {
  if ((card.kind !== "berlangsung" && card.kind !== "berikutnya") || card.session.kind !== "makan") return card;
  const today = wibDate(now.toISOString()), limit = now.getTime() + MEAL_GIVES_WAY_MINUTES * 60_000;
  const real = sessions.filter(isLive).filter(session => session.kind !== "makan" && wibDate(session.startsAt) === today)
    .filter(session => Date.parse(session.startsAt) > now.getTime() && Date.parse(session.startsAt) <= limit)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.sort - b.sort)[0];
  return real ? { kind: "berikutnya", session: real } : card;
}

/** A session's place as lists show it: "Kumpul lobby 19.15 · opsional" for an optional one. */
export const placeLine = (session: Pick<MwSession, "place" | "optional">) =>
  [session.place.trim(), session.optional ? "opsional" : ""].filter(Boolean).join(" · ");

/* ── The contextual card ──────────────────────────────────────────────────────────────────────── */

/** A candidate with the instant its sub line counts to ("sampai 15.00"), and a survey's minutes ("5 menit"). */
export type HomeCandidate = HomeCardCandidate & { until?: string | null; minutes?: number | null };

/**
 * Pengumuman penting still pinned (newest first, as the server reads them), with their tone
 * (pinnedForMe's; noteTone of the fondasi when a reader left it out): warning for a change such as
 * "Jam kumpul berubah" (P02__status), else info.
 */
export function announcementCandidates(pinned: readonly MwNotification[], now: Date): HomeCandidate[] {
  return pinned.filter(note => note.kind === "pengumuman" && note.pinnedUntil && Date.parse(note.pinnedUntil) > now.getTime())
    .map(note => ({ kind: "pengumuman", id: note.id, title: note.title, body: note.body, pinnedUntil: note.pinnedUntil!, tone: note.tone ?? noteTone(note) }));
}

/** Silent Meeting questions open now (silentState of the fondasi: session hours, panitia's override). */
export function silentCandidates(questions: readonly MwSilentQuestion[], sessions: readonly MwSession[], now: Date): HomeCandidate[] {
  const byId = new Map(sessions.map(session => [session.id, session]));
  return questions.flatMap(question => {
    const session = byId.get(question.sessionId);
    if (!session || silentState(question, session, now) !== "buka") return [];
    const closes = silentClosesAt(question, session);
    return [{ kind: "silent" as const, questionId: question.id, sessionId: session.id, closesAt: closes ?? "", until: closes }];
  });
}

/** Voting categories open now that the person has not voted in, the one closing first first. */
export function votingCandidates(categories: readonly MwAwardCategory[], voted: ReadonlySet<string>, now: Date): HomeCandidate[] {
  return categories.filter(category => votingState(category, now) === "buka" && !voted.has(category.id))
    .sort((a, b) => Date.parse(a.closesAt ?? "") - Date.parse(b.closesAt ?? ""))
    .map(category => ({ kind: "voting" as const, categoryId: category.id, title: category.title, closesAt: category.closesAt, until: category.closesAt }));
}

const TICKET_KINDS = ["kereta", "bus"] as const;
/** The travel card shows from this long before the day's first step. */
export const TRAVEL_CARD_HOURS = 3;
/** "Kereta ke Malang": the step's name and where it goes ("Yogyakarta → Malang"). */
export function tripTitle(trip: Pick<MwTrip, "title" | "place">): string {
  const to = trip.place.split("→")[1]?.trim();
  return to ? `${trip.title} ke ${to}` : trip.title;
}

/**
 * The travel day's card (P02): on the day of the way there (or back), from three hours before its
 * first step, the train (else the bus) not yet arrived, with the person's seat. The gathering is already the Sekarang card, so it is not
 * repeated here.
 */
export function travelCandidate(trips: readonly MwTrip[], seats: readonly MwTripSeat[], now: Date): HomeCandidate | null {
  const today = wibDate(now.toISOString());
  const seatOf = new Map(seats.map(seat => [seat.tripId, seat]));
  for (const direction of ["berangkat", "pulang"] as const) {
    const ofToday = trips.filter(trip => trip.direction === direction && trip.startsAt && wibDate(trip.startsAt) === today);
    // From three hours before the first step of the day (the way back does not hide the morning's survey).
    const first = Math.min(...ofToday.map(trip => Date.parse(trip.startsAt!)));
    if (!ofToday.length || now.getTime() < first - TRAVEL_CARD_HOURS * 3_600_000) continue;
    const legs = ofToday
      .filter(trip => Date.parse(sessionEnd({ startsAt: trip.startsAt!, endsAt: trip.endsAt })) > now.getTime())
      .sort((a, b) => a.sort - b.sort || Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
    for (const kind of TICKET_KINDS) {
      const trip = legs.find(leg => leg.kind === kind);
      if (!trip) continue;
      const seat = seatOf.get(trip.id);
      return { kind: "berangkat", direction, tripId: trip.id, title: tripTitle(trip), startsAt: trip.startsAt, seat: seat?.seat || seat?.vehicle || trip.detail };
    }
  }
  return null;
}

/**
 * Survei: the card while the survey is open for this person (surveyFor / the one rule in
 * survey.ts, audit R7: from its session's start until the questionnaire closes or the event ends,
 * gone once they sent it).
 */
export function surveyCandidate(open: SurveyOpen | null): HomeCandidate | null {
  return open ? { kind: "survei", formSlug: open.formSlug, title: "Survei evaluasi", until: open.until, minutes: open.minutes } : null;
}

/** The one card (pickHomeCard of the fondasi: order, and no card of a module that is off). */
export const pickCard = (candidates: readonly HomeCandidate[], modules: ModuleSwitches, now: Date) =>
  pickHomeCard(candidates, modules, now) as HomeCandidate | null;

export type HomeCardView =
  | { kind: "pengumuman"; id: string; title: string; body: string; tone: NoteTone }
  | { kind: "silent" | "voting" | "berangkat" | "survei"; title: string; sub: string; action: string; target: { silentSession?: string; survey?: string; direction?: "berangkat" | "pulang" } };

/** "sampai 15.00", or with the day when it closes on another day. */
function untilWords(now: Date, iso: string | null | undefined): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return wibDate(iso) === wibDate(now.toISOString()) ? `sampai ${hhmm(iso)}` : `sampai ${dayWord(wibDate(iso), wibDate(now.toISOString()))} ${hhmm(iso)}`;
}
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What the chosen card says (P01__status): title, one line, and its button. */
export function homeCardView(card: HomeCandidate, now: Date): HomeCardView {
  switch (card.kind) {
    case "pengumuman": return { kind: "pengumuman", id: card.id, title: card.title, body: card.body, tone: card.tone ?? "info" };
    case "silent": {
      const until = untilWords(now, card.until);
      return { kind: "silent", title: "Silent Meeting dibuka", sub: until ? `Tanpa nama · ${until}` : "Tanpa nama", action: "Kirim masukan", target: { silentSession: card.sessionId } };
    }
    case "voting": {
      const until = untilWords(now, card.until);
      return { kind: "voting", title: "Voting Awarding dibuka", sub: until ? capital(until) : "Pilih nominasimu", action: "Pilih nominasi", target: {} };
    }
    case "berangkat":
      return { kind: "berangkat", title: card.startsAt ? `${card.title} · ${hhmm(card.startsAt)}` : card.title, sub: card.seat, action: "Lihat tiket", target: { direction: card.direction } };
    case "survei": {
      const until = untilWords(now, card.until);
      const sub = [card.minutes ? `${card.minutes} menit` : "", until ?? ""].filter(Boolean).join(" · ");
      return { kind: "survei", title: `${card.title} dibuka`, sub: capital(sub), action: "Isi survei", target: { survey: card.formSlug } };
    }
  }
}

/** Everything Beranda shows of agen A (the page, GET mainWamApi.home, the previews). */
export type HomeData = {
  /** False before Main WAM's migration: "menunggu pembaruan sistem". */
  migrated: boolean;
  now: NowView;
  /** The Sekarang card's session (for agen D's SessionAbsen), when it has one. */
  session: MwSession | null;
  card: HomeCardView | null;
  /** The next moment the cards change by themselves (for a refresh while Beranda is open). */
  refreshAt: string | null;
  /** The server's clock when this was read: the phone counts `refreshAt` from it, not from its own clock (audit S6). */
  serverNow: string;
  /** The rundown could not be read: the card says so, with "Coba lagi". */
  failed: boolean;
};

/* ── When Beranda changes by itself ───────────────────────────────────────────────────────────── */

/**
 * The next moment the cards change without anyone acting (a session starts or ends, absen opens or
 * closes, a pin runs out), so an open Beranda refreshes then. Null when nothing changes in the
 * next 12 hours.
 */
export function nextChangeAt(sessions: readonly MwSession[], now: Date, extra: readonly (string | null | undefined)[] = []): string | null {
  const limit = now.getTime() + 12 * 3_600_000;
  const moments = sessions.filter(isLive).flatMap(session => {
    const window = checkInWindow(session);
    return [session.startsAt, sessionEnd(session), ...(session.usesAttendance ? [window.opens, window.closes] : [])];
  }).concat(extra.filter((value): value is string => !!value));
  const next = moments.map(iso => Date.parse(iso)).filter(time => time > now.getTime() && time <= limit).sort((a, b) => a - b)[0];
  return next === undefined ? null : new Date(next).toISOString();
}
