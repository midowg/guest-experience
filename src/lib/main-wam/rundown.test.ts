import { describe, expect, it } from "vitest";
import {
  agendaDay, autoTag, checkInState, checkInWindow, dayWord, eventDates, eventDay, eventDayLabel, nowAndNext, nowCard, sessionEnd, sessionsOfDay, tagChoices, timeRange,
} from "./rundown";
import { sampleSession, sampleSessionIds, sampleSessions, sampleTimes } from "./sample";
import type { MwSession } from "./types";

const event = { startDate: "2027-01-04", endDate: "2027-01-07" };
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const none = new Set<string>();

describe("the event's days", () => {
  it("are the four days, first to last", () => {
    expect(eventDates(event)).toEqual(["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
  });

  it("say which day it is: Hari ke-2 dari 4, nothing outside the event", () => {
    expect(eventDay("2027-01-05", event)).toEqual({ day: 2, of: 4 });
    expect(eventDayLabel("2027-01-05", event)).toBe("Hari ke-2 dari 4");
    expect(eventDayLabel("2027-01-07", event)).toBe("Hari ke-4 dari 4");
    expect(eventDay("2027-01-03", event)).toBeNull();
    expect(eventDayLabel("2027-01-08", event)).toBe("");
  });

  it("open Agenda on the asked day, else today, else the first day before and the last after", () => {
    expect(agendaDay("3", "2027-01-05", event)).toBe(3);
    expect(agendaDay("9", "2027-01-05", event)).toBe(2);
    expect(agendaDay(undefined, "2027-01-05", event)).toBe(2);
    expect(agendaDay(null, "2026-12-20", event)).toBe(1);
    expect(agendaDay("", "2027-01-10", event)).toBe(4);
  });

  it("put each session on the WIB day it starts, in order", () => {
    const day2 = sessionsOfDay(sampleSessions, 2, event);
    expect(day2[0].title).toBe("Wellness pagi");
    expect(day2.map(session => session.title)).toContain("Pemaparan departemen");
    expect(day2.every(session => session.startsAt.startsWith("2027-01-05"))).toBe(true);
    expect(sessionsOfDay(sampleSessions, 5, event)).toEqual([]);
  });
});

describe("now and next", () => {
  it("give a moment without an end 30 minutes", () => {
    const shuttle = sampleSession("shuttle");
    expect(shuttle.endsAt).toBeNull();
    expect(Date.parse(sessionEnd(shuttle)) - Date.parse(shuttle.startsAt)).toBe(30 * 60_000);
    expect(timeRange(shuttle)).toBe("14.30");
    expect(timeRange(sampleSession("pemaparan"))).toBe("08.00–12.00");
  });

  it("find what runs and what comes next, published only", () => {
    const { running, next } = nowAndNext(sampleSessions, sampleTimes.pemaparan);
    expect(running.map(session => session.title)).toEqual(["Pemaparan departemen"]);
    expect(next?.title).toBe("Makan siang");
    const drafted = sampleSessions.map(session => session.id === sampleSessionIds.pemaparan ? { ...session, status: "draf" as const } : session);
    expect(nowAndNext(drafted, sampleTimes.pemaparan).running).toEqual([]);
  });

  it("open absen 30 minutes before the start and close it 30 minutes after the end", () => {
    const session = sampleSession("pemaparan");
    expect(checkInWindow(session)).toEqual({ opens: at("2027-01-05", "07:30").toISOString(), closes: at("2027-01-05", "12:30").toISOString() });
    expect(checkInState(session, at("2027-01-05", "07:29"))).toBe("belum");
    expect(checkInState(session, at("2027-01-05", "07:30"))).toBe("buka");
    expect(checkInState(session, at("2027-01-05", "12:30"))).toBe("buka");
    expect(checkInState(session, at("2027-01-05", "12:31"))).toBe("tutup");
  });
});

describe("the Sekarang card on Beranda", () => {
  it("shows first a session whose absen is open and not done yet", () => {
    // 07.40: Sarapan runs, Pemaparan's absen is open (07.30).
    const card = nowCard(sampleSessions, sampleTimes.pagi, { absenOn: true, checkedIn: none });
    expect(card).toEqual({ kind: "absen", session: sampleSession("pemaparan") });
  });

  it("then the running session, once checked in or without the absen module", () => {
    const checked = new Set([sampleSessionIds.pemaparan]);
    expect(nowCard(sampleSessions, sampleTimes.pemaparan, { absenOn: true, checkedIn: checked })).toEqual({ kind: "berlangsung", session: sampleSession("pemaparan") });
    expect(nowCard(sampleSessions, sampleTimes.pemaparan, { absenOn: false, checkedIn: none })).toEqual({ kind: "berlangsung", session: sampleSession("pemaparan") });
  });

  it("never picks a meal over a real session running at the same time", () => {
    // 07.40 without absen: only Sarapan runs, so it shows; with Wellness overlapping, Wellness wins.
    expect(nowCard(sampleSessions, sampleTimes.pagi, { absenOn: false, checkedIn: none })).toMatchObject({ kind: "berlangsung", session: { title: "Sarapan" } });
    const overlap: MwSession[] = sampleSessions.map(session => session.id === sampleSessionIds.wellness ? { ...session, endsAt: "2027-01-05T08:00:00+07:00" } : session);
    expect(nowCard(overlap, sampleTimes.pagi, { absenOn: false, checkedIn: none })).toMatchObject({ kind: "berlangsung", session: { title: "Wellness pagi" } });
  });

  it("shows the next session when nothing runs", () => {
    expect(nowCard(sampleSessions, at("2027-01-05", "14:40"), { absenOn: false, checkedIn: none })).toMatchObject({ kind: "berikutnya", session: { title: "Team building" } });
  });

  it("shows the day as done after its last session, with tomorrow's first", () => {
    expect(nowCard(sampleSessions, at("2027-01-05", "22:30"), { absenOn: false, checkedIn: none })).toEqual({ kind: "selesai", tomorrow: sampleSession("trekking") });
    expect(nowCard(sampleSessions, at("2027-01-07", "23:00"), { absenOn: false, checkedIn: none })).toEqual({ kind: "selesai", tomorrow: null });
  });

  it("before the event shows the first session, and nothing without sessions", () => {
    expect(nowCard(sampleSessions, at("2026-12-30", "09:00"), { absenOn: true, checkedIn: none })).toMatchObject({ kind: "berikutnya", session: { title: "Kumpul di Stasiun Tugu" } });
    expect(nowCard([], sampleTimes.pagi, { absenOn: true, checkedIn: none })).toEqual({ kind: "kosong" });
  });

  it("on the day of departure opens on the kumpul's absen (P02)", () => {
    expect(nowCard(sampleSessions, sampleTimes.berangkat, { absenOn: true, checkedIn: none })).toEqual({ kind: "absen", session: sampleSession("kumpul") });
  });
});

describe("photo tags", () => {
  it("tag a photo with the session running now", () => {
    expect(autoTag(sampleSessions, sampleTimes.teamBuilding)?.title).toBe("Team building");
    expect(autoTag(sampleSessions, sampleTimes.pemaparan)?.title).toBe("Pemaparan departemen");
  });

  it("prefer a real session over a meal, then the latest started; Umum when nothing runs", () => {
    const lunchOverlap = sampleSessions.map(session => session.id === sampleSessionIds.pemaparan ? { ...session, endsAt: "2027-01-05T12:30:00+07:00" } : session);
    expect(autoTag(lunchOverlap, at("2027-01-05", "12:10"))?.title).toBe("Pemaparan departemen");
    expect(autoTag(sampleSessions, at("2027-01-05", "14:45"))).toBeNull();
    expect(autoTag(sampleSessions.map(session => ({ ...session, status: "batal" as const })), sampleTimes.teamBuilding)).toBeNull();
  });

  it("offer the sessions already started, newest day first", () => {
    const choices = tagChoices(sampleSessions, sampleTimes.teamBuilding);
    expect(choices.map(day => day.date)).toEqual(["2027-01-05", "2027-01-04"]);
    expect(choices[0].sessions.at(-1)?.title).toBe("Team building");
    expect(choices[0].sessions.some(session => session.title === "Makan malam")).toBe(false);
  });

  it("name days as people say them", () => {
    expect(dayWord("2027-01-05", "2027-01-05")).toBe("Hari ini");
    expect(dayWord("2027-01-04", "2027-01-05")).toBe("Kemarin");
    expect(dayWord("2027-01-06", "2027-01-05")).toBe("Besok");
    expect(dayWord("2027-01-07", "2027-01-05")).toMatch(/7 Jan/);
  });
});
