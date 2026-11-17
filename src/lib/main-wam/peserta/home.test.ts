import { describe, expect, it } from "vitest";
import { defaultSettings } from "../settings";
import {
  sampleAttendance, sampleAwards, sampleNotifications, sampleSeats, sampleSessionIds, sampleSessions, sampleSessionsChanged, sampleSettings, sampleSilentQuestion,
  sampleTime, sampleTrips, sampleViewers,
} from "../sample";
import type { MwSession } from "../types";
import {
  announcementCandidates, homeCardView, mealGivesWay, nextChangeAt, nowView, pickCard, silentCandidates, surveyCandidate, travelCandidate, tripTitle, votingCandidates,
  type HomeCandidate,
} from "./home";

/* Beranda (P01/P02 and P01__status): the Sekarang card and the one contextual card at the prototype's moments. */

const event = sampleSettings().event;
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const rani = sampleViewers.peserta.id;
const checkedBy = (now: Date) => new Map(sampleAttendance.filter(row => row.employeeId === rani && Date.parse(row.checkedInAt) <= now.getTime()).map(row => [row.sessionId, row.checkedInAt]));
const sessionsAt = (now: Date) => (now.getTime() >= Date.parse("2027-01-05T10:20:00+07:00") ? sampleSessionsChanged() : sampleSessions);
const view = (now: Date, absenOn = true) => nowView({ sessions: sessionsAt(now), now, event, absenOn, checkedIn: checkedBy(now) });

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

  it("pemaparan (10.05): running, Hadir 07.52 beside it", () => {
    expect(view(sampleTime("pemaparan"))).toMatchObject({ title: "Pemaparan departemen", status: "live", when: "Hadir 07.52", absen: false });
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
    expect(homeCardView(card, now)).toEqual({ kind: "berangkat", title: "Kereta ke Malang · 06.30", sub: "Gerbong 3 · Kursi 12A", action: "Lihat tiket", target: { direction: "berangkat" } });
    // Kam 08.10: the way back starts 12.30, so not yet (the survey shows); 10.00: the train home.
    expect(travelCandidate(sampleTrips, seats, at("2027-01-07", "08:10"))).toBeNull();
    expect(travelCandidate(sampleTrips, seats, at("2027-01-07", "10:00"))).toMatchObject({ direction: "pulang", title: "Kereta ke Yogyakarta", seat: "Gerbong 5 · Kursi 8C" });
    // After arriving: nothing.
    expect(travelCandidate(sampleTrips, seats, at("2027-01-04", "14:30"))).toMatchObject({ title: "Shuttle ke hotel" });
    expect(travelCandidate(sampleTrips, seats, at("2027-01-05", "08:00"))).toBeNull();
  });

  it("survey: during its session, when a questionnaire is chosen", () => {
    const now = at("2027-01-07", "08:10");
    const card = surveyCandidate("survei-wam", sampleSessions, now)!;
    expect(homeCardView(card, now)).toEqual({ kind: "survei", title: "Survei evaluasi dibuka", sub: "Sampai 09.30", action: "Isi survei", target: { survey: "survei-wam" } });
    expect(surveyCandidate(null, sampleSessions, now)).toBeNull();
    expect(surveyCandidate("survei-wam", sampleSessions, at("2027-01-07", "10:00"))).toBeNull();
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
