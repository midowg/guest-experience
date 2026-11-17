import { describe, expect, it } from "vitest";
import { sampleRundownLog, sampleSessionIds, sampleSessions, sampleSessionsChanged, sampleSettings } from "../sample";
import type { MwSession, RundownChange } from "../types";
import { agendaDays, agendaRows, movedInRundown, shownDay, timeChange } from "./agenda";
import { sessionView } from "./session";

/* Agenda (P03, P03__status) and the changes of a session (P04__status#jam-berubah). */

const event = sampleSettings().event;
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const session = (key: string, list: MwSession[] = sampleSessions) => list.find(item => item.id === sampleSessionIds[key])!;
const change = (key: string, changes: RundownChange["changes"], changedAt = "2027-01-05T10:20:00+07:00"): RundownChange =>
  ({ id: `log-${key}`, sessionId: sampleSessionIds[key], changes, notified: true, recipients: 1, changedBy: null, changedAt });

describe("the day tabs", () => {
  it("are the four days, today marked, and the asked day or today shown", () => {
    expect(agendaDays(event, "2027-01-05").map(day => [day.day, day.date, day.today])).toEqual([
      ["Hari 1", "Sen, 4 Jan", false], ["Hari 2", "Sel, 5 Jan", true], ["Hari 3", "Rab, 6 Jan", false], ["Hari 4", "Kam, 7 Jan", false],
    ]);
    expect(shownDay(undefined, at("2027-01-05", "07:40"), event)).toBe(2);
    expect(shownDay("3", at("2027-01-05", "07:40"), event)).toBe(3);
    expect(shownDay(["9"], at("2026-12-01", "07:40"), event)).toBe(1);
    expect(shownDay("x", at("2027-02-01", "07:40"), event)).toBe(4);
  });
});

describe("the rows of a day", () => {
  it("P03 at 07.40: Wellness done, Sarapan lit, the rest to come; place and optional", () => {
    const rows = agendaRows(sampleSessions, 2, event, at("2027-01-05", "07:40"), []);
    expect(rows.map(row => [row.start, row.title, row.status])).toEqual([
      ["06.00", "Wellness pagi", "done"], ["07.00", "Sarapan", "live"], ["08.00", "Pemaparan departemen", "upcoming"], ["12.00", "Makan siang", "upcoming"],
      ["13.00", "Silent Meeting", "upcoming"], ["15.00", "Team building", "upcoming"], ["18.30", "Makan malam", "upcoming"], ["19.30", "Batu Night Spectacular", "upcoming"],
    ]);
    expect(rows.at(-1)).toMatchObject({ end: "22.00", place: "Kumpul lobby 19.15 · opsional", changed: false });
  });

  it("never shows drafts; a cancelled session is struck through and not marked changed", () => {
    const list = sampleSessions.map(item => item.id === sampleSessionIds.bns ? { ...item, status: "batal" as const, changedAt: "2027-01-05T10:20:00+07:00" }
      : item.id === sampleSessionIds["team-building"] ? { ...item, status: "draf" as const } : item);
    const rows = agendaRows(list, 2, event, at("2027-01-05", "07:40"), []);
    expect(rows.find(row => row.title === "Team building")).toBeUndefined();
    expect(rows.find(row => row.title === "Batu Night Spectacular")).toMatchObject({ status: "cancelled", changed: false });
  });

  it("a moment without an end shows its start only", () => {
    expect(agendaRows(sampleSessions, 1, event, at("2027-01-04", "05:00"), []).find(row => row.title === "Shuttle ke hotel")).toMatchObject({ start: "14.30", end: "" });
  });

  it("after the 10.20 change: Jam berubah on the moved sessions", () => {
    const log = [change("silent", [{ field: "startsAt", from: "2027-01-05T13:00:00+07:00", to: null }, { field: "endsAt", from: "2027-01-05T14:30:00+07:00", to: null }]), ...sampleRundownLog];
    const rows = agendaRows(sampleSessionsChanged(), 2, event, at("2027-01-05", "10:30"), log);
    expect(rows.filter(row => row.changed).map(row => row.title)).toEqual(["Pemaparan departemen", "Makan siang", "Silent Meeting"]);
  });
});

describe("what changed", () => {
  const changed = sampleSessionsChanged();
  it("says the end, the start, or both, against the hours before the first change", () => {
    expect(timeChange(session("pemaparan", changed), sampleRundownLog)?.text).toBe("Selesai 12.30, tadinya 12.00");
    expect(timeChange(session("silent", changed), [change("silent", [{ field: "startsAt", from: "2027-01-05T13:00:00+07:00", to: null }])])?.text).toBe("Mulai 13.30, tadinya 13.00");
    expect(timeChange(session("silent", changed), [change("silent", [{ field: "startsAt", from: "2027-01-05T13:00:00+07:00", to: null }, { field: "endsAt", from: "2027-01-05T14:30:00+07:00", to: null }])])?.text)
      .toBe("Jadi 13.30–15.00, tadinya 13.00–14.30");
  });

  it("is nothing when moved back, or only the place changed", () => {
    expect(timeChange(session("pemaparan"), sampleRundownLog)).toBeNull();
    expect(timeChange(session("pemaparan", changed), [change("pemaparan", [{ field: "place", from: "Aula", to: "Ballroom" }])])).toBeNull();
  });

  it("falls back on the change mark when the log has nothing of the session", () => {
    expect(movedInRundown(session("silent", changed), [])).toBe(true);
    expect(movedInRundown(session("silent"), [])).toBe(false);
    expect(movedInRundown(session("pemaparan", changed), [change("pemaparan", [{ field: "place", from: "A", to: "B" }])])).toBe(false);
  });
});

describe("Detail sesi", () => {
  it("P04 at 10.05: running, day and hours, place, dresscode, what to bring, Info lainnya", () => {
    const view = sessionView(session("pemaparan"), at("2027-01-05", "10:05"), [], true);
    expect(view).toMatchObject({ status: "live", when: "Sel, 5 Jan · 08.00–12.00", place: "Aula Utama · lantai 1", dresscode: "Kaos WAM", change: null, infoSub: "Urutan, konsumsi, panitia" });
    expect(view.lineup).toHaveLength(7);
  });

  it("not started: no pill; done after its end; cancelled", () => {
    expect(sessionView(session("pemaparan"), at("2027-01-05", "07:40"), [], true).status).toBe("upcoming");
    expect(sessionView(session("pemaparan"), at("2027-01-05", "12:10"), [], true).status).toBe("done");
    expect(sessionView({ ...session("pemaparan"), status: "batal" }, at("2027-01-05", "07:40"), [], true)).toMatchObject({ status: "cancelled", change: null });
  });

  it("the changed time, exact from the log or by the mark", () => {
    const changed = sampleSessionsChanged();
    expect(sessionView(session("pemaparan", changed), at("2027-01-05", "10:30"), sampleRundownLog, true).change).toBe("Selesai 12.30, tadinya 12.00");
    expect(sessionView(session("silent", changed), at("2027-01-05", "10:30"), [], true).change).toBe("Jadwal diubah 10.20");
  });

  it("Info lainnya holds only what there is (no row without any)", () => {
    expect(sessionView(session("team-building"), at("2027-01-05", "16:10"), [], true).infoSub).toBe("Panitia");
    expect(sessionView(session("team-building"), at("2027-01-05", "16:10"), [], false).infoSub).toBe("");
    expect(sessionView(session("checkin"), at("2027-01-04", "15:00"), [], false).infoSub).toBe("Konsumsi");
  });
});
