import { describe, expect, it } from "vitest";
import { QR_ABSEN_VISIBLE } from "../modules";
import { defaultSettings } from "../settings";
import {
  sampleAttendance, sampleAwards, sampleNotifications, sampleSeats, sampleSessionIds, sampleSessions, sampleSessionsChanged, sampleSettings, sampleSilentQuestion,
  sampleTime, sampleTrips, sampleViewers,
} from "../sample";
import type { MwSession } from "../types";
import {
  announcementCandidates, homeCardView, homeSlides, mealGivesWay, nextChangeAt, nowView, pickCard, silentCandidates, surveyCandidate, travelCandidate, tripTitle, votingCandidates,
  type HomeCandidate,
} from "./home";

/* Beranda (P01/P02 and P01__status): the Sekarang card and the one contextual card at the prototype's moments. */

const event = sampleSettings().event;
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const rani = sampleViewers.peserta.id;
const checkedBy = (now: Date) => new Map(sampleAttendance.filter(row => row.employeeId === rani && Date.parse(row.checkedInAt) <= now.getTime()).map(row => [row.sessionId, row.checkedInAt]));
const sessionsAt = (now: Date) => (now.getTime() >= Date.parse("2027-01-05T10:20:00+07:00") ? sampleSessionsChanged() : sampleSessions);
// `qr`: the QR check-in is shown (true here: these tests check the card of that flow; the hidden state, the default, is below).
const view = (now: Date, absenOn = true, qr = true) => nowView({ sessions: sessionsAt(now), now, event, absenOn, checkedIn: checkedBy(now), qr });

describe("the Sekarang card", () => {
  it("berangkat (Sen 05.05): Kumpul, absen open, 25 minutes to go, with Absen", () => {
    expect(view(sampleTime("berangkat"))).toMatchObject({ kind: "sesi", title: "Kumpul di Stasiun Tugu", status: "next", when: "25 menit lagi", absen: true, time: "05.30–06.15" });
  });

  it("pagi (Sel 07.40, P01): Pemaparan, absen open over a running breakfast, 20 minutes to go", () => {
    const card = view(sampleTime("pagi"));
    expect(card).toMatchObject({ kind: "sesi", title: "Pemaparan departemen", status: "next", when: "20 menit lagi", whenAt: "2027-01-05T08:00:00+07:00", absen: true });
  });

  it("07.10 (absen not open yet): the coming Pemaparan, not the running breakfast, without Absen", () => {
    expect(view(at("2027-01-05", "07:10"))).toMatchObject({ title: "Pemaparan departemen", status: "next", when: "50 menit lagi", absen: false });
  });

  it("07.52 (checked in): Hadir 07.52, 8 minutes to go, no Absen", () => {
    expect(view(at("2027-01-05", "07:52"))).toMatchObject({ title: "Pemaparan departemen", status: "present", statusText: "Hadir 07.52", when: "8 menit lagi", absen: false });
  });

  it("pemaparan (10.05): running, Hadir 07.52 as the check-in line of the foot (not beside the pill)", () => {
    expect(view(sampleTime("pemaparan"))).toMatchObject({ title: "Pemaparan departemen", status: "live", statusText: "Hadir 07.52", when: null, absen: false });
  });

  it("silent (13.45, after the 10.20 change): Silent Meeting running, absen open", () => {
    expect(view(sampleTime("silent"))).toMatchObject({ title: "Silent Meeting", status: "live", time: "13.30–15.00", absen: true });
  });

  it("teamBuilding (15.20): the ended Silent Meeting while its absen is still open, then it says until when", () => {
    expect(view(sampleTime("teamBuilding"))).toMatchObject({ title: "Silent Meeting", status: "done", when: "Absen sampai 15.30", absen: true });
  });

  it("without the Absen module (or for BOD): no Absen and no Hadir", () => {
    expect(view(sampleTime("pagi"), false)).toMatchObject({ title: "Pemaparan departemen", status: "next", absen: false });
    expect(view(at("2027-01-05", "07:52"), false)).toMatchObject({ status: "next", statusText: null });
    expect(view(sampleTime("bod"), false)).toMatchObject({ title: "Refleksi & arah bersama", status: "live" });
  });

  it("QR check-in hidden (QR_ABSEN_VISIBLE false, KONTRAK 41): no open absen anywhere, the card keeps its normal order, and 'Hadir' shows once recorded", () => {
    expect(QR_ABSEN_VISIBLE).toBe(false);
    // The default (no qr passed) is the hidden state.
    const plain = (now: Date) => nowView({ sessions: sessionsAt(now), now, event, absenOn: true, checkedIn: checkedBy(now) });
    expect(plain(sampleTime("berangkat"))).toMatchObject({ kind: "sesi", absen: false });
    expect(plain(sampleTime("berangkat"))).not.toHaveProperty("absenCloses");
    expect(plain(sampleTime("pagi"))).toMatchObject({ title: "Pemaparan departemen", status: "next", absen: false, statusText: null });
    expect(plain(sampleTime("silent"))).toMatchObject({ absen: false, statusText: null });
    // The ended Silent Meeting no longer holds the card for its 30 minutes of absen: nothing for the person to do on it.
    const ended = plain(sampleTime("teamBuilding"));
    expect(ended).toMatchObject({ kind: "sesi", absen: false });
    expect(ended).not.toMatchObject({ when: "Absen sampai 15.30" });
    // Recorded (by the tablet or panitia): the check line stays, whatever the switch.
    expect(plain(at("2027-01-05", "07:52"))).toMatchObject({ title: "Pemaparan departemen", status: "present", statusText: "Hadir 07.52", absen: false });
    expect(plain(sampleTime("pemaparan"))).toMatchObject({ status: "live", statusText: "Hadir 07.52", absen: false });
    // Explicitly on again: the same as before.
    expect(view(sampleTime("berangkat"))).toMatchObject({ absen: true, absenCloses: expect.any(String) });
  });

  it("22.10: today is done, tomorrow's first session and its Agenda day", () => {
    expect(view(at("2027-01-05", "22:10"))).toEqual({ kind: "selesai", tomorrow: { title: "Trekking Coban Rondo", when: "Besok 06.00", day: 3 } });
  });

  it("nothing published: kosong", () => {
    expect(nowView({ sessions: [], now: sampleTime("pagi"), event, absenOn: true, checkedIn: new Map() })).toEqual({ kind: "kosong" });
  });

  it("a meal keeps the card when no real session starts within 90 minutes", () => {
    const meal = sampleSessions.find(session => session.id === sampleSessionIds["makan-malam-2"])!;
    const withoutNight = sampleSessions.filter(session => session.id !== sampleSessionIds.bns);
    expect(mealGivesWay({ kind: "berlangsung", session: meal }, withoutNight, at("2027-01-05", "18:40"))).toMatchObject({ kind: "berlangsung", session: { title: "Makan malam" } });
    // 19.30 Batu Night Spectacular starts within 90 minutes of 18.40.
    expect(mealGivesWay({ kind: "berlangsung", session: meal }, sampleSessions, at("2027-01-05", "18:40"))).toMatchObject({ kind: "berikutnya", session: { title: "Batu Night Spectacular" } });
    // Not a meal, or absen open: untouched.
    const absen = { kind: "absen" as const, session: meal };
    expect(mealGivesWay(absen, sampleSessions, at("2027-01-05", "18:40"))).toBe(absen);
  });
});

describe("the contextual card", () => {
  const modules = sampleSettings().modules;
  const pinned = sampleNotifications;

  it("a pinned announcement wins while it is pinned (and only pengumuman)", () => {
    const now = at("2027-01-05", "13:45");
    const cards = [...announcementCandidates(pinned, now), ...silentCandidates([sampleSilentQuestion], sampleSessionsChanged(), now)];
    expect(pickCard(cards, modules, now)).toMatchObject({ kind: "pengumuman", title: "Team building mulai 15.00 di Lawn" });
    expect(announcementCandidates(pinned, at("2027-01-05", "15:01"))).toEqual([]);
  });

  it("Silent Meeting open: Kirim masukan, Tanpa nama · sampai 15.00; gone with the module off", () => {
    const now = sampleTime("silent");
    const [card] = silentCandidates([sampleSilentQuestion], sampleSessionsChanged(), now);
    expect(homeCardView(card, now)).toEqual({ kind: "silent", title: "Silent Meeting dibuka", sub: "Tanpa nama · sampai 15.00", action: "Kirim masukan", target: { silentSession: sampleSessionIds.silent } });
    expect(pickCard([card], { ...modules, silent: false }, now)).toBeNull();
    expect(silentCandidates([sampleSilentQuestion], sampleSessionsChanged(), sampleTime("teamBuilding"))).toEqual([]);
  });

  it("voting open and not voted: Pilih nominasi, Sampai 15.00; voted or closed: none", () => {
    const now = at("2027-01-06", "10:00");
    const cards = votingCandidates(sampleAwards, new Set(), now);
    expect(cards.map(card => card.kind === "voting" && card.title)).toEqual(["Rekan paling suportif", "Foto Momen terbaik"]);
    expect(homeCardView(cards[0], now)).toMatchObject({ title: "Voting Awarding dibuka", sub: "Sampai 15.00", action: "Pilih nominasi" });
    expect(votingCandidates(sampleAwards, new Set(sampleAwards.map(award => award.id)), now)).toEqual([]);
    expect(votingCandidates(sampleAwards, new Set(), at("2027-01-06", "16:00"))).toEqual([]);
  });

  it("travel day (P02): the train and the seat, from three hours before the day's first step", () => {
    const now = sampleTime("berangkat");
    const seats = sampleSeats.filter(seat => seat.employeeId === rani);
    const card = travelCandidate(sampleTrips, seats, now)!;
    expect(homeCardView(card, now)).toMatchObject({ kind: "berangkat", title: "Kereta ke Malang", sub: "", action: "Lihat tiket", target: { direction: "berangkat" }, trip: { from: "Yogyakarta", to: "Malang", depart: "06.30", arrive: "14.00", count: "25 menit lagi", countFor: "kumpul 05.30", tiles: [{ label: "Gerbong", value: "3" }, { label: "Kursi", value: "12A" }] } });
    // Kam 08.10: the way back starts 12.30, so not yet (the survey shows); 10.00: the train home.
    expect(travelCandidate(sampleTrips, seats, at("2027-01-07", "08:10"))).toBeNull();
    expect(travelCandidate(sampleTrips, seats, at("2027-01-07", "10:00"))).toMatchObject({ direction: "pulang", title: "Kereta ke Yogyakarta", seat: "Gerbong 5 · Kursi 8C" });
    // After arriving: nothing.
    expect(travelCandidate(sampleTrips, seats, at("2027-01-04", "14:30"))).toMatchObject({ title: "Shuttle ke hotel" });
    expect(travelCandidate(sampleTrips, seats, at("2027-01-05", "08:00"))).toBeNull();
  });

  it("survey (R7): the card follows the one rule (survey.ts), with its minutes and closing time", () => {
    const now = at("2027-01-07", "08:10");
    const card = surveyCandidate({ formSlug: "survei-wam", sessionId: sampleSessionIds.penutupan, until: "2027-01-07T12:00:00+07:00", minutes: 5 })!;
    expect(homeCardView(card, now)).toEqual({ kind: "survei", title: "Survei evaluasi dibuka", sub: "5 menit · sampai 12.00", action: "Isi survei", target: { survey: "survei-wam" } });
    expect(homeCardView(surveyCandidate({ formSlug: "s", sessionId: "x", until: null, minutes: null })!, now)).toMatchObject({ sub: "" });
    expect(surveyCandidate(null)).toBeNull();
  });

  it("a pinned announcement keeps its tone (F's pinnedForMe); without one, noteTone decides (P02__status: a change is a warning)", () => {
    const now = at("2027-01-04", "05:00");
    const note = { ...sampleNotifications[0], pinnedUntil: "2027-01-04T07:00:00+07:00" };
    const [warned] = announcementCandidates([{ ...note, title: "Pengumuman", tone: "warning" }], now);
    expect(homeCardView(warned, now)).toMatchObject({ kind: "pengumuman", tone: "warning" });
    const [plain] = announcementCandidates([{ ...note, title: "Bawa jaket", tone: "info" }], now);
    expect(homeCardView(plain, now)).toMatchObject({ tone: "info" });
    const [guessed] = announcementCandidates([{ ...note, title: "Jam kumpul berubah", tone: undefined }], now);
    expect(homeCardView(guessed, now)).toMatchObject({ tone: "warning" });
  });

  it("the order: pengumuman > silent > voting > berangkat > survei; nothing without candidates", () => {
    const now = at("2027-01-07", "08:10");
    const cards: HomeCandidate[] = [
      { kind: "survei", formSlug: "s", title: "Survei evaluasi" },
      { kind: "berangkat", direction: "pulang", tripId: "t", title: "Kereta", startsAt: null, seat: "" },
      { kind: "voting", categoryId: "c", title: "V", closesAt: null },
    ];
    expect(pickCard(cards, defaultSettings().modules, now)?.kind).toBe("berangkat");
    expect(pickCard(cards, sampleSettings().modules, now)?.kind).toBe("voting");
    expect(pickCard([], sampleSettings().modules, now)).toBeNull();
  });

  it("names a step by where it goes", () => {
    expect(tripTitle({ title: "Kereta", place: "Yogyakarta → Malang" })).toBe("Kereta ke Malang");
    expect(tripTitle({ title: "Kumpul", place: "Stasiun Tugu" })).toBe("Kumpul");
  });
});

describe("when Beranda refreshes by itself", () => {
  it("at the next start, end or absen window edge", () => {
    expect(nextChangeAt(sampleSessions, sampleTime("pagi"))).toBe(new Date("2027-01-05T08:00:00+07:00").toISOString());
    expect(nextChangeAt(sampleSessions, at("2027-01-05", "07:10"))).toBe(new Date("2027-01-05T07:30:00+07:00").toISOString());
    expect(nextChangeAt([] as MwSession[], sampleTime("pagi"), ["2027-01-05T09:00:00+07:00"])).toBe(new Date("2027-01-05T09:00:00+07:00").toISOString());
    expect(nextChangeAt(sampleSessions, at("2027-01-08", "12:00"))).toBeNull();
  });
});

describe("the slide of three cards (homeSlides)", () => {
  const D = "2027-01-05";
  const mk = (id: string, start: string, end: string, extra: Partial<MwSession> = {}): MwSession =>
    ({ ...sampleSessions[0], id, title: `Sesi ${id}`, startsAt: at(D, start).toISOString(), endsAt: at(D, end).toISOString(), sort: Number(id.replace(/\D/g, "")) || 0, status: "terbit", kind: "sesi", place: "Aula", optional: false, ...extra });
  const list = [mk("a1", "08:00", "09:00"), mk("a2", "09:00", "10:00"), mk("a3", "10:00", "11:00"), mk("a4", "11:00", "12:00")];
  const view = (now: Date, sessions: readonly MwSession[]) => nowView({ sessions, now, event, absenOn: false, checkedIn: new Map() });
  const slides = (now: Date, sessions: readonly MwSession[] = list) => homeSlides(sessions, now, view(now, sessions));
  /** The session id (or the reason it is empty) on each of the three places. */
  const names = (result: ReturnType<typeof slides>) => result.slots.map(slot => slot.session?.sessionId ?? slot.empty ?? "now");
  const tomorrowOf = (id: string) => mk(id, "08:00", "09:00", { startsAt: at("2027-01-06", "08:00").toISOString(), endsAt: at("2027-01-06", "09:00").toISOString() });

  it("always three places, Sekarang the middle one, in every situation", () => {
    for (const [now, sessions] of [[at(D, "10:30"), list], [at(D, "07:30"), list], [at(D, "11:30"), list], [at(D, "20:00"), list], [at(D, "08:30"), [list[0]]], [at(D, "08:30"), []]] as const) {
      const result = slides(now, sessions);
      expect(result.slots.map(slot => slot.slot)).toEqual(["done", "now", "upcoming"]);
      expect(result.slots[1]).toEqual({ slot: "now", session: null, empty: null });
    }
  });

  it("a session is running: the one that has just ended before it, the one after it behind", () => {
    const result = slides(at(D, "10:30"));
    expect(result.slots[0].session).toMatchObject({ sessionId: "a2", title: "Sesi a2", time: "09.00–10.00", place: "Aula", sessionKind: "sesi" });
    expect(result.slots[2].session).toMatchObject({ sessionId: "a4", title: "Sesi a4" });
    expect(names(result)).toEqual(["a2", "now", "a4"]);
  });

  it("nothing has ended yet (before the first session of the day): Selesai is a placeholder, the Sekarang card is the next one", () => {
    const result = slides(at(D, "07:30"));
    expect(result.slots[0]).toEqual({ slot: "done", session: null, empty: "noDone" });
    expect(result.slots[2].session).toMatchObject({ sessionId: "a2" });
  });

  it("between sessions, no one running: the nearest next one is the Sekarang card, the one after it comes behind", () => {
    const gap = [mk("a1", "08:00", "09:00"), mk("a2", "10:00", "11:00"), mk("a3", "12:00", "13:00")];
    const now = at(D, "09:30");
    expect(view(now, gap)).toMatchObject({ kind: "sesi", sessionId: "a2", status: "next" });
    expect(names(slides(now, gap))).toEqual(["a1", "now", "a3"]);
  });

  it("the last session of the day is running: the one before it, a placeholder after it (noUpcoming without a later day)", () => {
    expect(names(slides(at(D, "11:30")))).toEqual(["a3", "now", "noUpcoming"]);
  });

  it("the last session of the day, a later day has sessions: the placeholder says tomorrow", () => {
    expect(names(slides(at(D, "11:30"), [...list, tomorrowOf("b1")]))).toEqual(["a3", "now", "tomorrow"]);
  });

  it("the day is over: the last one to end is the Selesai card beside 'Hari ini selesai', a placeholder after", () => {
    const sessions = [...list, tomorrowOf("b1")];
    const now = at(D, "20:00");
    expect(view(now, sessions)).toMatchObject({ kind: "selesai" });
    expect(names(slides(now, sessions))).toEqual(["a4", "now", "tomorrow"]);
    expect(names(slides(now))).toEqual(["a4", "now", "noUpcoming"]);
  });

  it("a single session, or none: the Sekarang card in the middle, a placeholder on each side", () => {
    expect(names(slides(at(D, "08:30"), [list[0]]))).toEqual(["noDone", "now", "noUpcoming"]);
    expect(view(at(D, "08:30"), [])).toEqual({ kind: "kosong" });
    expect(names(slides(at(D, "08:30"), []))).toEqual(["noDone", "now", "noUpcoming"]);
  });

  it("yesterday's sessions do not make a Selesai card in the morning", () => {
    const yesterday = mk("y1", "20:00", "21:00");
    yesterday.startsAt = at("2027-01-04", "20:00").toISOString(); yesterday.endsAt = at("2027-01-04", "21:00").toISOString();
    expect(slides(at(D, "07:30"), [yesterday, ...list]).slots[0].empty).toBe("noDone");
  });

  it("drafts are left out (only published sessions count), and a session without an end counts for 30 minutes", () => {
    const draft = mk("d1", "10:30", "10:45", { status: "draf" });
    expect(slides(at(D, "10:50"), [...list, draft]).slots[0].session).toMatchObject({ sessionId: "a2" });
    const point = mk("p1", "09:00", "09:00", { endsAt: null });
    expect(slides(at(D, "09:40"), [list[0], point, list[2]]).slots[0].session).toMatchObject({ sessionId: "p1" });
  });

  it("the session that is the Sekarang card is never also on a side, and one that overlaps it in time is on neither", () => {
    const result = slides(at(D, "10:30"));
    expect(result.slots.map(slot => slot.session?.sessionId)).not.toContain("a3");
    const overlap = mk("o1", "10:00", "10:45");
    const withOverlap = slides(at(D, "10:30"), [...list, overlap]);
    expect(withOverlap.slots.map(slot => slot.session?.sessionId)).not.toContain("o1");
  });
});
