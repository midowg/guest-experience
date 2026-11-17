import { describe, expect, it } from "vitest";
import { sampleSession, sampleSessionIds, sampleSessions } from "../sample";
import type { MwSession, RundownChange } from "../types";
import { describeChange, laterSessions, liveOfDay, planShift, rowState, scheduleNotice, silentAction, silentLabel, typedTimes, type LiveSilent } from "./rundown";

const day2 = liveOfDay(sampleSessions, "2027-01-05");
const pemaparan = sampleSession("pemaparan");
const at = (time: string, date = "2027-01-05") => new Date(`${date}T${time}:00+07:00`);

describe("Rundown live rows", () => {
  it("lists the day's sessions in order, drafts left out, cancelled kept", () => {
    const draft = { ...sampleSession("wellness"), id: "draf", status: "draf" as const };
    const cancelled = { ...sampleSession("team-building"), status: "batal" as const };
    const list = liveOfDay([...sampleSessions.filter(session => session.id !== cancelled.id), draft, cancelled], "2027-01-05");
    expect(list.map(session => session.title)).toEqual(["Wellness pagi", "Sarapan", "Pemaparan departemen", "Makan siang", "Silent Meeting", "Team building", "Makan malam", "Batu Night Spectacular"]);
    expect(list.find(session => session.title === "Team building")?.status).toBe("batal");
  });

  it("tells done, live, upcoming and cancelled apart", () => {
    const now = at("10:15");
    expect(rowState(sampleSession("wellness"), now)).toBe("done");
    expect(rowState(pemaparan, now)).toBe("live");
    expect(rowState(sampleSession("silent"), now)).toBe("upcoming");
    expect(rowState({ ...pemaparan, status: "batal" }, now)).toBe("cancelled");
  });

  it("offers Buka before and Tutup while a Silent Meeting is open, nothing once closed (closed is final)", () => {
    const silent = sampleSession("silent");
    const base: LiveSilent = { questionId: "q", state: "belum", count: null };
    expect(silentAction(base, silent)).toBe("buka");
    expect(silentAction({ ...base, state: "buka" }, silent)).toBe("tutup");
    // Closed by panitia before its end: never Buka again.
    expect(silentAction({ ...base, state: "tutup" }, silent)).toBeNull();
    expect(silentAction({ ...base, state: "tutup", count: 47 }, silent)).toBeNull();
    expect(silentAction(base, { ...silent, status: "batal" })).toBeNull();
    expect(silentLabel(base)).toBe("Belum dibuka");
    // While open: no count, only its state.
    expect(silentLabel({ ...base, state: "buka" })).toBe("Dibuka");
    expect(silentLabel({ ...base, state: "tutup", count: 47 })).toBe("Ditutup · 47 masukan");
    expect(silentLabel({ ...base, state: "tutup" })).toBe("Ditutup");
  });
});

describe("Ubah jam (K03)", () => {
  it("fills the fields with the session's times", () => {
    expect(typedTimes(pemaparan)).toEqual({ start: "08.00", end: "12.00" });
    expect(typedTimes(sampleSession("shuttle"))).toEqual({ start: "14.30", end: "" });
  });

  it("moves the sessions it runs into by default, and shows the first one that stays (prototype K03)", () => {
    const plan = planShift(pemaparan, day2, { start: "08.00", end: "12.30" }, null);
    expect(plan.ok).toBe(true);
    expect(plan.help).toBe("Tadinya 08.00–12.00 · +30 menit");
    expect(plan.shiftLabel).toBe("Sesi berikutnya ikut bergeser +30 menit");
    expect(plan.rows.map(row => [row.title, row.checked, row.becomes, row.clash])).toEqual([
      ["Makan siang", true, "12.30–13.30", false],
      ["Silent Meeting", true, "13.30–15.00", false],
      ["Team building", false, "15.00–17.00", false],
    ]);
    expect(plan.rows[0].was).toBe("12.00–13.00");
    expect(plan.moved.map(move => move.id)).toEqual([sampleSessionIds["makan-siang-2"], sampleSessionIds.silent]);
    expect(plan.endsAt).toBe(at("12:30").toISOString());
  });

  it("refuses to save while a session that stays now clashes (prototype K03__status)", () => {
    const checked = new Set([sampleSessionIds["makan-siang-2"], sampleSessionIds.silent]);
    const plan = planShift(pemaparan, day2, { start: "08.00", end: "13.00" }, checked);
    expect(plan.help).toBe("Tadinya 08.00–12.00 · +60 menit");
    expect(plan.rows.map(row => [row.title, row.becomes, row.clash])).toEqual([
      ["Makan siang", "13.00–14.00", false],
      ["Silent Meeting", "14.00–15.30", false],
      ["Team building", "15.00–17.00", true],
    ]);
    expect(plan.ok).toBe(false);
    const fixed = planShift(pemaparan, day2, { start: "08.00", end: "13.00" }, new Set([...checked, sampleSessionIds["team-building"]]));
    expect(fixed.ok).toBe(true);
    expect(fixed.rows.map(row => row.title)).toEqual(["Makan siang", "Silent Meeting", "Team building", "Makan malam"]);
  });

  it("reads typed times leniently and says what is wrong", () => {
    expect(planShift(pemaparan, day2, { start: "8", end: "1230" }, null).ok).toBe(true);
    expect(planShift(pemaparan, day2, { start: "08,00", end: "12:30" }, null).ok).toBe(true);
    expect(planShift(pemaparan, day2, { start: "25.00", end: "12.30" }, null)).toMatchObject({ ok: false, error: "Tulis jam seperti 08.00.", errorField: "start" });
    expect(planShift(pemaparan, day2, { start: "08.00", end: "" }, null)).toMatchObject({ ok: false, errorField: "end" });
    expect(planShift(pemaparan, day2, { start: "12.00", end: "11.00" }, null)).toMatchObject({ ok: false, error: "Jam selesai harus setelah jam mulai." });
    expect(planShift(pemaparan, day2, { start: "08.00", end: "12.00" }, null)).toMatchObject({ ok: false, changed: false, rows: [], shiftLabel: null });
  });

  it("does not move anyone when the end stays, and catches an earlier session it runs into", () => {
    const later = planShift(pemaparan, day2, { start: "08.30", end: "12.00" }, null);
    expect(later).toMatchObject({ ok: true, delta: 0, rows: [], shiftLabel: null, help: "Tadinya 08.00–12.00" });
    const early = planShift(pemaparan, day2, { start: "07.30", end: "12.00" }, null);
    expect(early).toMatchObject({ ok: false, error: "Bentrok dengan Sarapan 07.00–08.00." });
  });

  it("shifts a moment without an end by its start, and leaves parallel sessions alone", () => {
    const day1 = liveOfDay(sampleSessions, "2027-01-04");
    const shuttle = sampleSession("shuttle");
    const plan = planShift(shuttle, day1, { start: "15.00", end: "" }, null);
    expect(plan.delta).toBe(30 * 60_000);
    expect(plan.endsAt).toBeNull();
    expect(plan.rows[0]).toMatchObject({ title: "Check-in & penyambutan", checked: false });
    const parallel: MwSession = { ...sampleSession("team-building"), id: "p", title: "Sesi paralel", startsAt: pemaparan.startsAt, endsAt: pemaparan.endsAt };
    const withParallel = planShift(pemaparan, [...day2, parallel], { start: "08.00", end: "12.30" }, null);
    expect(withParallel.rows.find(row => row.title === "Sesi paralel")).toMatchObject({ checked: false, clash: false });
    expect(laterSessions(pemaparan, [...day2, parallel]).map(session => session.title)).toContain("Sesi paralel");
  });

  it("runs past midnight: Selesai at or before Mulai ends the next day, and asks first (audit R10)", () => {
    const late: MwSession = { ...sampleSession("bns"), startsAt: at("21:00").toISOString(), endsAt: at("23:00").toISOString() };
    const plan = planShift(late, [late], { start: "21.00", end: "00.30" }, null);
    expect(plan).toMatchObject({ ok: true, error: null, nextDay: "Selesai besok, Rab, 6 Jan · 00.30", confirmNextDay: true, help: "Tadinya 21.00–23.00 · +90 menit" });
    expect(plan.endsAt).toBe(at("00:30", "2027-01-06").toISOString());
    // Already past midnight: the same times are no change, a new start keeps the next-day end without asking again.
    const overnight: MwSession = { ...late, endsAt: plan.endsAt };
    expect(typedTimes(overnight)).toEqual({ start: "21.00", end: "00.30" });
    expect(planShift(overnight, [overnight], typedTimes(overnight), null)).toMatchObject({ changed: false, nextDay: "Selesai besok, Rab, 6 Jan · 00.30" });
    expect(planShift(overnight, [overnight], { start: "21.30", end: "00.30" }, null)).toMatchObject({ ok: true, confirmNextDay: false, delta: 0 });
    // Back on its own day: no next-day note.
    expect(planShift(overnight, [overnight], { start: "21.00", end: "23.30" }, null)).toMatchObject({ ok: true, nextDay: null, confirmNextDay: false });
    // At most 12 hours; longer (or the same time) is a typo.
    expect(planShift(late, [late], { start: "20.00", end: "08.00" }, null).ok).toBe(true);
    expect(planShift(late, [late], { start: "21.00", end: "09.30" }, null)).toMatchObject({ ok: false, error: "Jam selesai harus setelah jam mulai.", errorField: "end" });
    expect(planShift(late, [late], { start: "21.00", end: "21.00" }, null)).toMatchObject({ ok: false, errorField: "end" });
    // A same-day change never asks.
    expect(planShift(pemaparan, day2, { start: "08.00", end: "12.30" }, null)).toMatchObject({ nextDay: null, confirmNextDay: false });
  });

  it("writes the notice as the new times", () => {
    expect(scheduleNotice([{ title: "Pemaparan departemen", startsAt: at("08:00").toISOString(), endsAt: at("12:30").toISOString() }, { title: "Makan siang", startsAt: at("12:30").toISOString(), endsAt: at("13:30").toISOString() }]))
      .toBe("Pemaparan departemen 08.00–12.30. Makan siang 12.30–13.30.");
  });
});

describe("Riwayat perubahan", () => {
  const entry = (changes: RundownChange["changes"]): RundownChange => ({ id: "l", sessionId: "s", changes, notified: true, recipients: 122, changedBy: null, changedAt: at("10:20").toISOString() });
  it("says what changed in words", () => {
    expect(describeChange(entry([{ field: "startsAt", from: at("08:00").toISOString(), to: at("08:30").toISOString() }, { field: "endsAt", from: at("12:00").toISOString(), to: at("12:30").toISOString() }])))
      .toBe("Jam 08.30–12.30, tadinya 08.00–12.00");
    expect(describeChange(entry([{ field: "endsAt", from: at("12:00").toISOString(), to: at("12:30").toISOString() }]))).toBe("Selesai 12.30, tadinya 12.00");
    expect(describeChange(entry([{ field: "place", from: "Aula Utama", to: "Lawn" }]))).toBe("Tempat Lawn, tadinya Aula Utama");
    expect(describeChange(entry([{ field: "status", from: "terbit", to: "batal" }]))).toBe("Dibatalkan");
    expect(describeChange(entry([{ field: "status", from: "batal", to: "terbit" }]))).toBe("Dijadwalkan lagi");
  });
});
