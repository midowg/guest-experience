import { pickHomeCard, type HomeCardCandidate } from "../home-card";
import { t, type Lang } from "../i18n";
import { noteTone } from "../notify";
import { silentClosesAt, silentState, votingState } from "../module-state";
import { checkInWindow, dayWord, eventDay, hasEnded, isLive, isRunning, nowCard, sessionEnd, timeRange, wibDate, type NowCard } from "../rundown";
import type { MainWamEventInfo, ModuleSwitches, MwAwardCategory, MwNotification, MwSession, MwSilentQuestion, MwTrip, MwTripSeat, NoteTone } from "../types";
import { hhmm, untilLabel } from "./format";
import { ticketOf } from "./travel";
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
    /** The check-in line in the card's foot ("Hadir 07.52", prototipe .foot); null when the person has not checked in. */
    statusText: string | null;
    /** The caption on the right: "20 menit lagi". */
    when: string | null;
    /** The instant "20 menit lagi" counts to (the screen keeps counting); null for words that do not change. */
    whenAt: string | null;
    /** Absen is open and the person has not checked in: the card carries agen D's Absen (SessionAbsen). */
    absen: boolean;
    /** How far the session has run, 0 to 1 (the thin bar on the card); null before it starts. */
    /** The session kind (the little tag at the top right: Sesi, Makan, Perjalanan, Jeda). */
    sessionKind?: MwSession["kind"];
    progress?: number | null;
    /** "08.30": until when absen stays open (beside the Absen button); null when it is not open. */
    absenCloses?: string | null;
    /** The session after this one (prototipe "BERIKUTNYA 12.00 Makan siang"); null when none follows that day. */
    next?: { time: string; title: string; place: string } | null;
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
  /** The words' language (default Indonesian). */
  lang?: Lang;
};

/** The Sekarang card (nowCard of the fondasi, in the card's words). */
export function nowView({ sessions, now, event, absenOn, checkedIn, lang = "id" }: NowInput): NowView {
  const attended = absenOn ? checkedIn : new Map<string, string>();
  const card: NowCard = mealGivesWay(nowCard(sessions, now, { absenOn, checkedIn: new Set(attended.keys()) }), sessions, now);
  if (card.kind === "kosong") return { kind: "kosong" };
  if (card.kind === "selesai") {
    const next = card.tomorrow;
    if (!next) return { kind: "selesai", tomorrow: null };
    const today = wibDate(now.toISOString()), date = wibDate(next.startsAt);
    const word = dayWord(date, today, lang);
    return { kind: "selesai", tomorrow: { title: next.title, when: word === t(lang, "fmt.tomorrow") ? t(lang, "fmt.tomorrowAt", { time: hhmm(next.startsAt, lang) }) : `${word} · ${hhmm(next.startsAt, lang)}`, day: eventDay(date, event)?.day ?? null } };
  }
  const session = card.session;
  const at = attended.get(session.id) ?? null;
  const running = isRunning(session, now);
  const start = Date.parse(session.startsAt), end = Date.parse(sessionEnd(session));
  const progress = running && end > start ? Math.min(Math.max((now.getTime() - start) / (end - start), 0), 1) : null;
  const following = sessions.filter(isLive).filter(other => other.id !== session.id && Date.parse(other.startsAt) >= end - 1 && wibDate(other.startsAt) === wibDate(session.startsAt))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.sort - b.sort)[0];
  const next = following ? { time: hhmm(following.startsAt, lang), title: following.title, place: following.place.trim() } : null;
  const base = { kind: "sesi" as const, sessionId: session.id, title: session.title, time: timeRange(session, lang), place: placeLine(session, lang), sessionKind: session.kind, progress, next };
  if (card.kind === "absen") {
    // Ended, but absen stays open 30 minutes more: say until when.
    if (hasEnded(session, now)) return { ...base, status: "done", statusText: null, when: t(lang, "peserta.home.absenUntil", { time: hhmm(checkInWindow(session).closes, lang) }), whenAt: null, absen: true, absenCloses: hhmm(checkInWindow(session).closes, lang) };
    return { ...base, status: running ? "live" : "next", statusText: null, when: running ? null : untilLabel(now, session.startsAt, lang), whenAt: running ? null : session.startsAt, absen: true, absenCloses: hhmm(checkInWindow(session).closes, lang) };
  }
  if (card.kind === "berlangsung") {
    return { ...base, status: "live", statusText: at ? t(lang, "peserta.home.present", { time: hhmm(at, lang) }) : null, when: null, whenAt: null, absen: false };
  }
  return at
    ? { ...base, status: "present", statusText: t(lang, "peserta.home.present", { time: hhmm(at, lang) }), when: untilLabel(now, session.startsAt, lang), whenAt: session.startsAt, absen: false }
    : { ...base, status: "next", statusText: null, when: untilLabel(now, session.startsAt, lang), whenAt: session.startsAt, absen: false };
}

/* ── The slide of three cards ─────────────────────────────────────────────────────────────────── */

/** A session on the slide's side cards ("Selesai" before the Sekarang card, "Akan datang" after it). */
export type SlideSession = {
  sessionId: string;
  title: string;
  /** "08.00–12.00". */
  time: string;
  place: string;
  sessionKind: MwSession["kind"];
};

/** Why a side slot has no session: nothing has ended today, nothing follows today, nothing follows today but a later day has sessions. */
export type SlideEmpty = "noDone" | "noUpcoming" | "tomorrow";
export type SlideName = "done" | "now" | "upcoming";

/** One of the three places on the slide. "now" is the Sekarang card (its content is the NowView); a side place holds a session, or says why it is empty. */
export type SlideSlot = { slot: SlideName; session: SlideSession | null; empty: SlideEmpty | null };

/** Always three places, in order: Selesai, Sekarang (index 1, always the middle one), Akan datang. */
export type HomeSlides = { slots: readonly [SlideSlot, SlideSlot, SlideSlot] };

/** The slide when nothing is known: the Sekarang card alone in the middle, a calm placeholder on each side. */
export const EMPTY_SLIDES: HomeSlides = { slots: [{ slot: "done", session: null, empty: "noDone" }, { slot: "now", session: null, empty: null }, { slot: "upcoming", session: null, empty: "noUpcoming" }] };

const slideSession = (session: MwSession, lang: Lang): SlideSession =>
  ({ sessionId: session.id, title: session.title, time: timeRange(session, lang), place: placeLine(session, lang), sessionKind: session.kind });

/**
 * The main card of Beranda is a slide of exactly three places (owner, 25 Nov): the session that has
 * just ended (the last one of today to end), the Sekarang card (`view`, always the middle one), and
 * the one that comes after it (the first of its day to start later). `sessions` is what the person
 * may see (visibleSessions: no drafts, no Persiapan with module Ceklis off), already loaded for the
 * Sekarang card, so this reads nothing more. A side place without a session is not dropped (the
 * Sekarang card must never slide to an edge): it says why it is empty, "noDone" (nothing has ended
 * today), "tomorrow" (nothing follows today, a later day has sessions) or "noUpcoming". Without a
 * Sekarang session ("Hari ini selesai", nothing published) nothing follows it on the slide.
 * A session that overlaps the Sekarang card in time is neither (done needs it to have ended, upcoming
 * needs it to start after the Sekarang card has started and after now).
 */
export function homeSlides(sessions: readonly MwSession[], now: Date, view: NowView, lang: Lang = "id"): HomeSlides {
  const live = sessions.filter(isLive);
  const today = wibDate(now.toISOString());
  const current = view.kind === "sesi" ? live.find(session => session.id === view.sessionId) ?? null : null;
  const done = live.filter(session => session.id !== current?.id && hasEnded(session, now) && wibDate(sessionEnd(session)) === today)
    .sort((a, b) => Date.parse(sessionEnd(b)) - Date.parse(sessionEnd(a)) || Date.parse(b.startsAt) - Date.parse(a.startsAt) || b.sort - a.sort)[0];
  const upcoming = current ? live.filter(session => session.id !== current.id && Date.parse(session.startsAt) > Date.parse(current.startsAt) && Date.parse(session.startsAt) > now.getTime() && wibDate(session.startsAt) === wibDate(current.startsAt))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.sort - b.sort)[0] : undefined;
  const day = current ? wibDate(current.startsAt) : today;
  const laterDay = live.some(session => wibDate(session.startsAt) > day);
  return { slots: [
    { slot: "done", session: done ? slideSession(done, lang) : null, empty: done ? null : "noDone" },
    { slot: "now", session: null, empty: null },
    { slot: "upcoming", session: upcoming ? slideSession(upcoming, lang) : null, empty: upcoming ? null : laterDay ? "tomorrow" : "noUpcoming" },
  ] };
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
export const placeLine = (session: Pick<MwSession, "place" | "optional">, lang: Lang = "id") =>
  [session.place.trim(), session.optional ? t(lang, "peserta.home.optional") : ""].filter(Boolean).join(" · ");

/* ── The contextual card ──────────────────────────────────────────────────────────────────────── */

/** A candidate with the instant its sub line counts to ("sampai 15.00"), and a survey's minutes ("5 menit"). */
export type HomeCandidate = HomeCardCandidate & { until?: string | null; minutes?: number | null; trip?: TripCardInfo | null };

/**
 * What the travel card shows beyond its title (prototipe skenario kereta): the route with both
 * times, the instant the big countdown counts to, and the small tiles (Peron, Gerbong, Kursi), each
 * only when the data holds it. Null for a step that is no train (a bus has its vehicle, nothing else).
 */
export type TripCardInfo = {
  from: string; to: string; depart: string; arrive: string;
  /** The instant the countdown counts to (the gathering while it is ahead, else the departure); null when it has passed. */
  countAt: string | null;
  /** "kumpul 06.15" / "berangkat 06.30": what the countdown is to. */
  countFor: string;
  tiles: { label: string; value: string }[];
};

export type TripCardView = TripCardInfo & { count: string | null };

const PLATFORM = /perons*([w-]+)/i;

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
export function tripTitle(trip: Pick<MwTrip, "title" | "place">, lang: Lang = "id"): string {
  const to = trip.place.split("→")[1]?.trim();
  return to ? t(lang, "peserta.home.tripTo", { title: trip.title, to }) : trip.title;
}

/** The route, countdown and tiles of a train step; a bus gives none. Nothing is invented: a tile shows only when the data names it. */
function tripCardInfo(trip: MwTrip, seat: MwTripSeat | undefined, ofToday: readonly MwTrip[], now: Date, lang: Lang): TripCardInfo | null {
  const ticket = ticketOf(trip, seat, lang);
  if (!ticket) return null;
  const gather = ofToday.filter(step => step.kind === "kumpul" && step.startsAt).sort((a, b) => a.sort - b.sort)[0];
  const platform = [gather, trip].flatMap(step => step ? [step.place, step.detail, step.note] : []).map(text => PLATFORM.exec(text)?.[1]).find(Boolean);
  const gatherAhead = gather?.startsAt && Date.parse(gather.startsAt) > now.getTime() ? gather.startsAt : null;
  const departAhead = trip.startsAt && Date.parse(trip.startsAt) > now.getTime() ? trip.startsAt : null;
  const countAt = gatherAhead ?? departAhead;
  const column = (key: "peserta.travel.coach" | "peserta.travel.seat") => ticket.cols.find(col => col.label === t(lang, key))?.value ?? "";
  const tiles = [
    { label: t(lang, "peserta.home.platform"), value: platform ?? "" },
    { label: t(lang, "peserta.travel.coach"), value: column("peserta.travel.coach") },
    { label: t(lang, "peserta.travel.seat"), value: column("peserta.travel.seat") },
  ].filter(tile => tile.value);
  return {
    from: ticket.from, to: ticket.to, depart: ticket.depart, arrive: ticket.arrive, countAt,
    countFor: countAt ? t(lang, gatherAhead ? "peserta.home.countGather" : "peserta.home.countDepart", { time: hhmm(countAt, lang) }) : "",
    tiles,
  };
}

/**
 * The travel day's card (P02): on the day of the way there (or back), from three hours before its
 * first step, the train (else the bus) not yet arrived, with the person's seat. The gathering is already the Sekarang card, so it is not
 * repeated here.
 */
export function travelCandidate(trips: readonly MwTrip[], seats: readonly MwTripSeat[], now: Date, lang: Lang = "id"): HomeCandidate | null {
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
      return { kind: "berangkat", direction, tripId: trip.id, title: tripTitle(trip, lang), startsAt: trip.startsAt, seat: seat?.seat || seat?.vehicle || trip.detail, trip: tripCardInfo(trip, seat, ofToday, now, lang) };
    }
  }
  return null;
}

/**
 * Survei: the card while the survey is open for this person (surveyFor / the one rule in
 * survey.ts, audit R7: from its session's start until the questionnaire closes or the event ends,
 * gone once they sent it).
 */
export function surveyCandidate(open: SurveyOpen | null, lang: Lang = "id"): HomeCandidate | null {
  return open ? { kind: "survei", formSlug: open.formSlug, title: t(lang, "peserta.home.surveyName"), until: open.until, minutes: open.minutes } : null;
}

/** The one card (pickHomeCard of the fondasi: order, and no card of a module that is off). */
export const pickCard = (candidates: readonly HomeCandidate[], modules: ModuleSwitches, now: Date) =>
  pickHomeCard(candidates, modules, now) as HomeCandidate | null;

export type HomeCardView =
  | { kind: "pengumuman"; id: string; title: string; body: string; tone: NoteTone }
  | { kind: "silent" | "voting" | "berangkat" | "survei"; title: string; sub: string; action: string; target: { silentSession?: string; survey?: string; direction?: "berangkat" | "pulang" };
    /** Berangkat only: the route, countdown and tiles of a train (null for a bus); `count` is the countdown's words on the server's clock. */
    trip?: TripCardView | null };

/** "sampai 15.00", or with the day when it closes on another day. */
function untilWords(now: Date, iso: string | null | undefined, lang: Lang): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return t(lang, "peserta.home.until", { when: wibDate(iso) === wibDate(now.toISOString()) ? hhmm(iso, lang) : `${dayWord(wibDate(iso), wibDate(now.toISOString()), lang)} ${hhmm(iso, lang)}` });
}
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What the chosen card says (P01__status): title, one line, and its button. */
export function homeCardView(card: HomeCandidate, now: Date, lang: Lang = "id"): HomeCardView {
  switch (card.kind) {
    case "pengumuman": return { kind: "pengumuman", id: card.id, title: card.title, body: card.body, tone: card.tone ?? "info" };
    case "silent": {
      const until = untilWords(now, card.until, lang);
      return { kind: "silent", title: t(lang, "peserta.home.silentTitle"), sub: until ? t(lang, "peserta.home.silentSub", { until }) : t(lang, "peserta.home.silentSubBare"), action: t(lang, "peserta.home.silentAction"), target: { silentSession: card.sessionId } };
    }
    case "voting": {
      const until = untilWords(now, card.until, lang);
      return { kind: "voting", title: t(lang, "peserta.home.votingTitle"), sub: until ? capital(until) : t(lang, "peserta.home.votingSub"), action: t(lang, "peserta.home.votingAction"), target: {} };
    }
    case "berangkat": {
      const trip = card.trip ? { ...card.trip, count: card.trip.countAt ? untilLabel(now, card.trip.countAt, lang) : null } : null;
      // With the route on the card, the time and the seat live in its tiles; without it (a bus), they stay in the words.
      return { kind: "berangkat", title: card.startsAt && !trip ? `${card.title} · ${hhmm(card.startsAt, lang)}` : card.title, sub: trip ? "" : card.seat, action: t(lang, "peserta.home.travelAction"), target: { direction: card.direction }, trip };
    }
    case "survei": {
      const until = untilWords(now, card.until, lang);
      const sub = [card.minutes ? t(lang, "peserta.home.minutes", { n: card.minutes }) : "", until ?? ""].filter(Boolean).join(" · ");
      return { kind: "survei", title: t(lang, "peserta.home.titleOpened", { title: card.title }), sub: capital(sub), action: t(lang, "peserta.home.surveyAction"), target: { survey: card.formSlug } };
    }
  }
}

/** Everything Beranda shows of agen A (the page, GET mainWamApi.home, the previews). */
export type HomeData = {
  /** False before Main WAM's migration: "menunggu pembaruan sistem". */
  migrated: boolean;
  now: NowView;
  /** The three places of the slide: Selesai, Sekarang, Akan datang. Left out: both sides empty. */
  slides?: HomeSlides;
  /** The Sekarang card's session (for agen D's SessionAbsen), when it has one. */
  session: MwSession | null;
  card: HomeCardView | null;
  /** The next moment the cards change by themselves (for a refresh while Beranda is open). */
  refreshAt: string | null;
  /** The server's clock when this was read: the phone counts `refreshAt` from it, not from its own clock (audit S6). */
  serverNow: string;
  /** The rundown could not be read: the card says so, with "Coba lagi". */
  failed: boolean;
  /** Module Ceklis: the Sekarang card's agenda has a checklist the person has not finished (one reminder line on the card). */
  ceklis?: { done: number; total: number } | null;
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
