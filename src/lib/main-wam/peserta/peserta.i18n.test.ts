import { describe, expect, it } from "vitest";
import { sampleSessions, sampleSettings, sampleTime, sampleTrips, sampleViewer } from "../sample";
import { dayWord, timeRange } from "../rundown";
import { agendaDays } from "./agenda";
import { durationLabel, hhmm, untilLabel } from "./format";
import { homeCardView, nowView, type HomeCandidate } from "./home";
import { roomWith } from "./saya";
import { eventDateRange } from "./splash";
import { directionLabel } from "./travel";

/* The same functions as their Indonesian tests, asked in English: words and clock follow the language, the day stays WIB. */

const now = new Date("2027-01-05T07:40:00+07:00");

describe("time words", () => {
  it("counts down in each language, and writes the clock as 08.00 or 08:00", () => {
    const soon = "2027-01-05T08:00:00+07:00";
    expect(untilLabel(now, soon)).toBe("20 menit lagi");
    expect(untilLabel(now, soon, "en")).toBe("in 20 min");
    expect(untilLabel(now, "2027-01-05T09:00:00+07:00", "en")).toBe("in 1 hr 20 min");
    expect(untilLabel(now, "2027-01-06T06:00:00+07:00")).toBe("Besok 06.00");
    expect(untilLabel(now, "2027-01-06T06:00:00+07:00", "en")).toBe("Tomorrow 06:00");
    expect(hhmm(soon)).toBe("08.00");
    expect(hhmm(soon, "en")).toBe("08:00");
    expect(timeRange({ startsAt: soon, endsAt: "2027-01-05T12:00:00+07:00" }, "en")).toBe("08:00–12:00");
    expect(durationLabel("2027-01-05T05:30:00+07:00", "2027-01-05T13:00:00+07:00")).toBe("±7,5 jam");
    expect(durationLabel("2027-01-05T05:30:00+07:00", "2027-01-05T13:00:00+07:00", "en")).toBe("~7.5 hr");
  });

  it("names the day: today, tomorrow, yesterday, else the short date", () => {
    expect(dayWord("2027-01-05", "2027-01-05", "en")).toBe("Today");
    expect(dayWord("2027-01-06", "2027-01-05", "en")).toBe("Tomorrow");
    expect(dayWord("2027-01-04", "2027-01-05", "en")).toBe("Yesterday");
    expect(dayWord("2027-01-07", "2027-01-05", "en")).toBe("Thu, 7 Jan");
    expect(dayWord("2027-01-07", "2027-01-05")).toBe("Kam, 7 Jan");
  });

  it("writes the event's dates with the month in the language", () => {
    expect(eventDateRange("2027-01-04", "2027-01-07")).toBe("4–7 Januari 2027");
    expect(eventDateRange("2027-01-04", "2027-01-07", "en")).toBe("4–7 January 2027");
  });
});

describe("Beranda's cards in English", () => {
  const event = sampleSettings().event;
  it("the Sekarang card carries the English clock and countdown", () => {
    const view = nowView({ sessions: sampleSessions, now, event, absenOn: true, checkedIn: new Map(), lang: "en" });
    expect(view.kind).toBe("sesi");
    if (view.kind !== "sesi") return;
    expect(view.time).toMatch(/^\d\d:\d\d(–\d\d:\d\d)?$/);
    expect(view.when ?? "").toMatch(/^(in \d+ (min|hr)|Shortly|Check in until|Tomorrow)/);
  });

  it("a Silent Meeting card says it in English, with the same target", () => {
    const card: HomeCandidate = { kind: "silent", questionId: "q", sessionId: "s", closesAt: "2027-01-05T15:00:00+07:00", until: "2027-01-05T15:00:00+07:00" };
    expect(homeCardView(card, now)).toMatchObject({ title: "Silent Meeting dibuka", sub: "Tanpa nama · sampai 15.00", action: "Kirim masukan" });
    expect(homeCardView(card, now, "en")).toMatchObject({ title: "Silent Meeting is open", sub: "No names · until 15:00", action: "Send feedback", target: { silentSession: "s" } });
  });
});

describe("Saya, Agenda and Perjalanan", () => {
  it("room mates read in English", () => {
    const people = [{ id: "a", name: "Rani", department: "CoE", me: true }, { id: "b", name: "Sari", department: "CoE", me: false }, { id: "c", name: "Dewi", department: "CoE", me: false }, { id: "d", name: "Gilang", department: "CoE", me: false }];
    expect(roomWith({ people: people.slice(0, 1) } as never, "en")).toBe("Alone");
    expect(roomWith({ people: people.slice(0, 3) } as never, "en")).toBe("with Sari, Dewi");
    expect(roomWith({ people } as never, "en")).toBe("with Sari, Dewi, and 1 more");
    expect(roomWith({ people } as never)).toBe("bersama Sari, Dewi, dan 1 lainnya");
    expect(sampleViewer("peserta").room).toBeTruthy();
  });

  it("day tabs and travel segments follow the language", () => {
    const event = sampleSettings().event;
    expect(agendaDays(event, "2027-01-05", "en")[1]).toMatchObject({ day: "Day 2", date: "Tue, 5 Jan", today: true });
    expect(agendaDays(event, "2027-01-05")[1]).toMatchObject({ day: "Hari 2", date: "Sel, 5 Jan", today: true });
    expect(directionLabel("berangkat", sampleTrips, "en")).toMatch(/^Departure · (Mon|Tue)/);
    expect(directionLabel("pulang", [], "en")).toBe("Return");
    expect(directionLabel("pulang", [])).toBe("Pulang");
    expect(sampleTime("pagi").getTime()).toBe(now.getTime());
  });
});

describe("the install guide (shared with Pra WAM, written in Indonesian there)", () => {
  it("has an English text for every step, found by its exact Indonesian text", async () => {
    const { installSteps, notificationSteps, installDevices } = await import("@/lib/pra-wam/install");
    const { translateKnown } = await import("../i18n");
    const steps = [...Object.values(installSteps).flat(), ...installDevices.flatMap(device => notificationSteps(device.id))];
    expect(steps.length).toBeGreaterThan(20);
    for (const step of steps) {
      expect(translateKnown("en", step.title), `title "${step.title}"`).not.toBe(step.title);
      expect(translateKnown("en", step.text), `text of "${step.title}"`).not.toBe(step.text);
      expect(translateKnown("id", step.title)).toBe(step.title);
    }
  });
});
