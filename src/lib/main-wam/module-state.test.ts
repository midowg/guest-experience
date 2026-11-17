import { describe, expect, it } from "vitest";
import { silentClosesAt, silentRecapReady, silentState, votingState } from "./module-state";
import { notePushTopic, announcementKind } from "./notify";
import { homeGreeting, salam } from "./greeting";
import { NOTE_KINDS } from "./types";

const session = { startsAt: "2027-01-05T13:00:00+07:00", endsAt: "2027-01-05T14:30:00+07:00", status: "terbit" as const };
const at = (time: string) => new Date(`2027-01-05T${time}:00+07:00`);
const follow = { override: null, autoClose: true };

describe("Silent Meeting opens and closes with its session", () => {
  it("follows the session's hours by itself", () => {
    expect(silentState(follow, session, at("12:59"))).toBe("belum");
    expect(silentState(follow, session, at("13:00"))).toBe("buka");
    expect(silentState(follow, session, at("14:29"))).toBe("buka");
    expect(silentState(follow, session, at("14:30"))).toBe("tutup");
    expect(Date.parse(silentClosesAt(follow, session)!)).toBe(Date.parse("2027-01-05T14:30:00+07:00"));
  });

  it("lets panitia open it early or close it early", () => {
    expect(silentState({ override: "buka", autoClose: true }, session, at("12:40"))).toBe("buka");
    expect(silentState({ override: "tutup", autoClose: true }, session, at("13:30"))).toBe("tutup");
    expect(silentClosesAt({ override: "tutup", autoClose: true }, session)).toBeNull();
  });

  it("stays open past the end only without Tutup otomatis", () => {
    expect(silentState({ override: "buka", autoClose: true }, session, at("15:00"))).toBe("tutup");
    expect(silentState({ override: "buka", autoClose: false }, session, at("15:00"))).toBe("buka");
    expect(silentClosesAt({ override: "buka", autoClose: false }, session)).toBeNull();
  });

  it("is closed with a cancelled session, and shows BOD the recap from 5 feedbacks", () => {
    expect(silentState({ override: "buka", autoClose: false }, { ...session, status: "batal" }, at("13:30"))).toBe("tutup");
    expect(silentState({ override: "buka", autoClose: false }, { ...session, status: "draf" }, at("13:30"))).toBe("belum");
    expect(silentRecapReady(4)).toBe(false);
    expect(silentRecapReady(5)).toBe(true);
  });
});

describe("voting's window", () => {
  const category = { method: "voting" as const, published: true, opensAt: "2027-01-06T08:00:00+07:00", closesAt: "2027-01-06T15:00:00+07:00" };
  it("opens and closes at its times, published voting only", () => {
    expect(votingState(category, new Date("2027-01-06T07:59:00+07:00"))).toBe("belum");
    expect(votingState(category, new Date("2027-01-06T10:00:00+07:00"))).toBe("buka");
    expect(votingState(category, new Date("2027-01-06T15:00:00+07:00"))).toBe("tutup");
    expect(votingState({ ...category, published: false }, new Date("2027-01-06T10:00:00+07:00"))).toBe("belum");
    expect(votingState({ ...category, method: "juri" }, new Date("2027-01-06T10:00:00+07:00"))).toBe("belum");
  });
});

describe("Main WAM's notifications on the phone", () => {
  it("push announcements and schedule changes always (also at night), the rest outside quiet hours, likes not at all", () => {
    expect(notePushTopic("pengumuman")).toBe("pengumuman");
    expect(notePushTopic("jadwal")).toBe("pengumuman");
    for (const kind of ["absen", "silent", "voting", "survei", "kamar"] as const) expect(notePushTopic(kind)).toBe("forum");
    expect(notePushTopic("momen")).toBeNull();
    expect(notePushTopic("momen", { photoHidden: true })).toBe("forum");
    expect(notePushTopic("lain")).toBeNull();
    for (const kind of NOTE_KINDS) expect(["pengumuman", "sesi"]).toContain(announcementKind(kind));
  });
});

describe("Beranda's greeting", () => {
  it("greets by the time of day in WIB and counts the day of the event", () => {
    expect(salam(new Date("2027-01-05T07:40:00+07:00"))).toBe("Selamat pagi");
    expect(salam(new Date("2027-01-05T12:00:00+07:00"))).toBe("Selamat siang");
    expect(salam(new Date("2027-01-05T16:00:00+07:00"))).toBe("Selamat sore");
    expect(salam(new Date("2027-01-05T19:00:00+07:00"))).toBe("Selamat malam");
    expect(homeGreeting(new Date("2027-01-05T07:40:00+07:00"), "Rani", { startDate: "2027-01-04", endDate: "2027-01-07" }))
      .toEqual({ kicker: "Selamat pagi", name: "Rani", day: "Hari ke-2 dari 4" });
    expect(homeGreeting(new Date("2026-12-01T07:40:00+07:00"), "Rani", { startDate: "2027-01-04", endDate: "2027-01-07" }))
      .toEqual({ kicker: "Selamat pagi · Sel, 1 Des", name: "Rani" });
    expect(homeGreeting(new Date("2027-01-04T05:05:00+07:00"), "Rani", { startDate: "2027-01-04", endDate: "2027-01-07" }).day).toBe("Hari ke-1 dari 4 · Berangkat");
    expect(homeGreeting(new Date("2027-01-07T09:00:00+07:00"), "Rani", { startDate: "2027-01-04", endDate: "2027-01-07" }).day).toBe("Hari ke-4 dari 4 · Pulang");
  });
});
