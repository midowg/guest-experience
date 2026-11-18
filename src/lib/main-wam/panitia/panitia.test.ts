import { describe, expect, it } from "vitest";
import { mainWamPath } from "@/lib/routes";
import { sampleAwards, sampleSession, sampleSessionIds, sampleSessions, sampleSettings } from "../sample";
import type { MwAwardApproval } from "../types";
import { attentionItems, kelolaTiles, requiredOpen, runningSessions, silentWaitingToday } from "./attention";
import { attendeeLine, mayRecord, mayUndo, pickAttendanceSession, presentLine, searchAttendees, splitAttendance, windowCaption, type AttendeeRow } from "./attendance";
import { clock, dayClock, editedLabel, parseClock, signedDuration } from "./format";
import { allowedActions, hiddenLine, moderationReason, ownerLine, reasonLines, reportNotes, waitingPhotos, type ModerationReport } from "./moderation";
import { announceSchema, moderateSchema, presentSchema, rundownChangeSchema } from "./schemas";
import { awardStatus, dayAverage, departmentStats, sessionStats, summaryRows } from "./summary";

const at = (time: string, date = "2027-01-05") => new Date(`${date}T${time}:00+07:00`);
const modules = sampleSettings().modules;

describe("format", () => {
  it("writes clock times, change marks and shifts as the screens do", () => {
    expect(clock(at("08:05").toISOString())).toBe("08.05");
    expect(dayClock(at("09:40").toISOString(), at("10:15"))).toBe("09.40");
    expect(dayClock(at("20:15", "2027-01-04").toISOString(), at("10:15"))).toBe("Sen, 4 Jan · 20.15");
    expect(editedLabel("Dimas", at("08:05").toISOString(), at("10:15"))).toBe("diubah Dimas · 08.05");
    expect(signedDuration(30 * 60_000)).toBe("+30 menit");
    expect(signedDuration(-15 * 60_000)).toBe("−15 menit");
    expect(signedDuration(90 * 60_000)).toBe("+90 menit");
    expect([parseClock("8"), parseClock("08.30"), parseClock("8:30"), parseClock("0830"), parseClock("830"), parseClock("8,3"), parseClock("24.00"), parseClock("ab")]).toEqual([480, 510, 510, 510, 510, 510, null, null]);
  });
});

describe("Absen sesi (K05)", () => {
  const row = (name: string, extra: Partial<AttendeeRow> = {}): AttendeeRow => ({ id: name, name, department: "Finance", photo: null, checkedInAt: null, method: null, ...extra });
  const rows = [row("Tari", { department: "Art & Creative Support" }), row("Bima"), row("Rani", { checkedInAt: at("07:52").toISOString(), method: "qr" }), row("Sari", { checkedInAt: at("08:10").toISOString(), method: "manual" }), row("André", { department: "CoE" })];

  it("splits Belum hadir and Hadir by name, with how and when", () => {
    const { absent, present } = splitAttendance(rows);
    expect(absent.map(item => item.name)).toEqual(["André", "Bima", "Tari"]);
    expect(present.map(presentLine)).toEqual(["07.52 · Scan QR", "08.10 · Dicatat panitia"]);
    expect(attendeeLine(rows[0])).toBe("Art & Creative Support");
    expect(attendeeLine(rows[4])).toBe("CoE");
  });

  it("lets panitia take back only what panitia recorded, never a QR scan (audit L8)", () => {
    expect(rows.filter(mayUndo).map(item => item.name)).toEqual(["Sari"]);
  });

  it("finds by name or department, accents and case ignored", () => {
    expect(searchAttendees(rows, "andre").map(item => item.name)).toEqual(["André"]);
    expect(searchAttendees(rows, "  creative tar ").map(item => item.name)).toEqual(["Tari"]);
    expect(searchAttendees(rows, "finance").length).toBe(3);
    expect(searchAttendees(rows, "").length).toBe(5);
  });

  it("says when absen is open, from 30 minutes before to 30 minutes after", () => {
    const pemaparan = sampleSession("pemaparan");
    expect(windowCaption(pemaparan, at("07:00"))).toBe("Absen dibuka 07.30");
    expect(windowCaption(pemaparan, at("10:15"))).toBe("Absen dibuka sampai 12.30");
    expect(windowCaption(pemaparan, at("13:00"))).toBe("Absen ditutup 12.30");
    expect(mayRecord(pemaparan, at("07:00"))).toBe(false);
    expect(mayRecord(pemaparan, at("13:00"))).toBe(true);
  });

  it("opens on the asked session, else the open one (running, wajib first), else the next, else the last", () => {
    const withAbsen = sampleSessions.filter(session => session.usesAttendance);
    expect(pickAttendanceSession(withAbsen, at("10:15"))?.id).toBe(sampleSessionIds.pemaparan);
    expect(pickAttendanceSession(withAbsen, at("10:15"), sampleSessionIds.trekking)?.id).toBe(sampleSessionIds.trekking);
    expect(pickAttendanceSession(withAbsen, at("10:15"), "bukan")?.id).toBe(sampleSessionIds.pemaparan);
    expect(pickAttendanceSession(withAbsen, at("12:45"))?.id).toBe(sampleSessionIds.silent);
    expect(pickAttendanceSession(withAbsen, at("23:00", "2027-01-08"))?.id).toBe(sampleSessionIds.penutupan);
    expect(pickAttendanceSession([], at("10:15"))).toBeNull();
  });
});

describe("Moderasi Momen (K08)", () => {
  const report = (photoId: string, reason: ModerationReport["reason"], time: string, note = ""): ModerationReport => ({ photoId, reason, note, createdAt: at(time).toISOString() });
  it("waits for panitia while a report is newer than the last decision", () => {
    const reports = [report("a", "tidak_setuju", "09:40"), report("b", "lainnya", "09:12", "x"), report("c", "tidak_pantas", "08:00")];
    const decisions = [{ photoId: "b", actedAt: at("09:30").toISOString() }, { photoId: "c", actedAt: at("08:30").toISOString() }];
    expect([...waitingPhotos(reports, decisions)].sort()).toEqual(["a"]);
    expect([...waitingPhotos([...reports, report("c", "data_pribadi", "10:00")], decisions)].sort()).toEqual(["a", "c"]);
  });

  it("sums the reasons (count only with more than one report) and keeps the newest notes, never who", () => {
    const three = [report("a", "tidak_setuju", "09:40", "Tolong hapus, saya belum siap difoto."), report("a", "tidak_pantas", "09:41"), report("a", "tidak_setuju", "09:45")];
    expect(reasonLines(three)).toEqual(["Saya ada di foto ini dan tidak setuju · 2", "Tidak pantas atau menyinggung · 1"]);
    expect(reasonLines([report("b", "data_pribadi", "09:12")])).toEqual(["Memperlihatkan data pribadi atau rahasia"]);
    expect(reportNotes(three)).toEqual(["Tolong hapus, saya belum siap difoto."]);
    expect(ownerLine({ owner: "Hana", createdAt: at("09:40").toISOString() }, at("10:15"))).toBe("Hana · 09.40");
    expect(ownerLine({ owner: "Gilang", createdAt: at("20:15", "2027-01-04").toISOString() }, at("10:15"))).toBe("Gilang · Sen, 4 Jan · 20.15");
  });

  it("offers Sembunyikan and Tampilkan lagi for a waiting photo, Tampilkan lagi and Hapus for a hidden one", () => {
    expect(allowedActions("ditinjau", true)).toEqual(["sembunyikan", "tampilkan"]);
    expect(allowedActions("tampil", true)).toEqual(["sembunyikan", "tampilkan"]);
    expect(allowedActions("disembunyikan", false)).toEqual(["tampilkan", "hapus"]);
  });

  it("keeps the reason panitia gave, a quick choice and/or a short note, for the log (audit L8)", () => {
    expect(moderationReason("tidak_pantas", "  Ada nomor\n kamar  ")).toBe("Tidak pantas · Ada nomor kamar");
    expect(moderationReason(null, "Diminta yang ada di foto")).toBe("Diminta yang ada di foto");
    expect(moderationReason("keberatan", "")).toBe("Ada yang keberatan");
    expect(moderationReason(null, "   ")).toBe("");
    expect(moderationReason("data_pribadi", "x".repeat(250)).length).toBe("Data pribadi · ".length + 200);
    const hidden = { hiddenBy: "Dimas", hiddenAt: at("09:05").toISOString(), hiddenReason: "Tidak pantas" };
    expect(hiddenLine(hidden, at("10:15"))).toBe("Disembunyikan Dimas · 09.05 · Tidak pantas");
    expect(hiddenLine({ ...hidden, hiddenBy: null, hiddenReason: "" }, at("10:15"))).toBe("Disembunyikan · 09.05");
  });
});

describe("Kehadiran (B02) and Ringkasan (B01)", () => {
  const day3 = ["trekking", "sharing-hospitality", "komitmen", "refleksi", "gala"].map(key => sampleSession(key));
  const expected = Array.from({ length: 120 }, (_, index) => `p${index}`);
  const presentOf = (n: number) => new Set(expected.slice(0, n));
  const present = new Map([[sampleSessionIds.trekking, presentOf(108)], [sampleSessionIds["sharing-hospitality"], presentOf(112)], [sampleSessionIds.komitmen, presentOf(115)], [sampleSessionIds.refleksi, new Set([...presentOf(104), "bukan-peserta"])]]);
  const now = at("16:00", "2027-01-06");

  it("counts each session among the expected, and averages the sessions that are over (prototype B02: 93%)", () => {
    const stats = sessionStats(day3, present, expected, now);
    expect(stats.map(stat => [stat.title, stat.present, stat.state])).toEqual([
      ["Trekking Coban Rondo", 108, "done"], ["Sharing session: Hospitality", 112, "done"], ["Penetapan komitmen", 115, "done"],
      ["Refleksi & arah bersama", 104, "live"], ["Gala Dinner & Awarding", 0, "upcoming"],
    ]);
    expect(dayAverage(stats)).toBe(93);
    expect(dayAverage(sessionStats(day3, present, expected, at("06:30", "2027-01-06")))).toBe(90);
    expect(dayAverage(sessionStats(day3, present, expected, at("05:00", "2027-01-06")))).toBeNull();
  });

  it("shows departments of 5 or more only, small ones together as Departemen lain", () => {
    const people = expected.map((id, index) => ({ id, department: index < 60 ? "CoE" : index < 117 ? "Finance" : "HRGA" }));
    const stats = sessionStats(day3, present, expected, now);
    const rows = departmentStats(stats, present, people);
    expect(rows.map(row => row.department)).toEqual(["CoE", "Finance"]);
    expect(rows[0].percent).toBe(100);
    const withSmall = departmentStats(stats, present, [...people.slice(0, 115), ...["a", "b", "c", "d", "e"].map((id, index) => ({ id, department: index < 3 ? "Legal" : "IT" }))]);
    expect(withSmall.at(-1)?.department).toBe("Departemen lain");
  });

  it("knows which awards wait for a BOD", () => {
    const [voting, foto, juri] = sampleAwards;
    expect(awardStatus(sampleAwards, [], at("16:00", "2027-01-06"))).toEqual({ pending: 3, approved: 0 });
    expect(awardStatus(sampleAwards, [], at("10:00", "2027-01-06"))).toEqual({ pending: 1, approved: 0 });
    expect(awardStatus(sampleAwards, [], at("10:00", "2027-01-05"))).toEqual({ pending: 0, approved: 0 });
    const approvals: MwAwardApproval[] = [voting, foto, juri].map(category => ({ categoryId: category.id, nomineeId: category.nominees[0].id, approvedBy: "x", approvedAt: at("18:00", "2027-01-06").toISOString() }));
    expect(awardStatus(sampleAwards, approvals, at("18:30", "2027-01-06"))).toEqual({ pending: 0, approved: 3 });
  });

  it("builds at most four rows in order, and no row for a module that is off (prototype B01, B01__status)", () => {
    const input = { modules, attendance: { percent: 93, day: 3 }, awards: { pending: 2, approved: 1 }, silentFeedback: 47, carbonKg: 13_640 };
    const rows = summaryRows(input);
    expect(rows.map(row => [row.title, row.value])).toEqual([
      ["Kehadiran hari ini", { kind: "angka", value: "93%" }],
      ["Awarding perlu persetujuan", { kind: "pill", tone: "warning", text: "2" }],
      ["Silent Meeting", { kind: "angka", value: "47", unit: "masukan" }],
      ["Jejak karbon", { kind: "angka", value: "13,6", unit: "t CO₂e" }],
    ]);
    expect(rows.map(row => row.href)).toEqual([mainWamPath.attendanceSummary(3), mainWamPath.awardApproval, mainWamPath.silentRecap, mainWamPath.carbon()]);
    expect(summaryRows({ ...input, modules: { ...modules, voting: false, karbon: false } }).map(row => row.key)).toEqual(["kehadiran", "silent"]);
    expect(summaryRows({ ...input, attendance: { percent: null, day: 1 }, awards: { pending: 0, approved: 0 }, silentFeedback: 0, carbonKg: null }).map(row => row.value.kind)).toEqual(["kosong", "kosong", "kosong", "kosong"]);
    // While a Silent Meeting is open its row says Dibuka, never a count (audit H2).
    expect(summaryRows({ ...input, silentOpen: true }).find(row => row.key === "silent")).toMatchObject({ value: { kind: "pill", text: "Dibuka" } });
    expect(summaryRows({ ...input, awards: { pending: 0, approved: 3 } })[1].value).toEqual({ kind: "pill", tone: "success", text: "Beres" });
  });

  it("writes a small Jejak karbon in kilograms, never 0,0 t (audit R16)", () => {
    const input = { modules, attendance: { percent: 93, day: 3 }, awards: { pending: 2, approved: 1 }, silentFeedback: 47 };
    const karbon = (carbonKg: number) => summaryRows({ ...input, carbonKg }).find(row => row.key === "karbon")!;
    expect(karbon(45.6).value).toEqual({ kind: "angka", value: "46", unit: "kg CO₂e" });
    expect(karbon(0.3).value).toEqual({ kind: "angka", value: "<1", unit: "kg CO₂e" });
    expect(karbon(99.4).value).toEqual({ kind: "angka", value: "99", unit: "kg CO₂e" });
    // From 0,1 t on: tonnes with one decimal.
    expect(karbon(99.6).value).toEqual({ kind: "angka", value: "0,1", unit: "t CO₂e" });
    expect(karbon(13_640).value).toEqual({ kind: "angka", value: "13,6", unit: "t CO₂e" });
    expect(karbon(1_240_000).value).toEqual({ kind: "angka", value: "1.240,0", unit: "t CO₂e" });
  });
});

describe("Panitia hub (K01)", () => {
  it("shows four shortcuts (Absen only with module Absen QR) and the reports badge", () => {
    expect(kelolaTiles(modules, 3).map(tile => [tile.label, tile.badge])).toEqual([["Rundown live", undefined], ["Absen", undefined], ["Pengumuman", undefined], ["Moderasi", 3]]);
    expect(kelolaTiles({ ...modules, absen: false }, 0).map(tile => tile.label)).toEqual(["Rundown live", "Pengumuman", "Moderasi"]);
  });

  it("lists what needs attention, only what there is (prototype K01)", () => {
    const pemaparan = sampleSession("pemaparan"), silent = sampleSession("silent");
    expect(requiredOpen(sampleSessions, at("10:15")).map(session => session.title)).toEqual(["Pemaparan departemen"]);
    expect(requiredOpen(sampleSessions, at("07:45"))).toEqual([]);
    expect(silentWaitingToday(silent, "belum", at("10:15"))).toBe(true);
    expect(silentWaitingToday(silent, "belum", at("10:15", "2027-01-04"))).toBe(false);
    const items = attentionItems({ modules, reported: 3, required: [{ session: pemaparan, present: 112, expected: 120 }], silent: [{ session: silent, day: 2 }] });
    expect(items.map(item => [item.title, item.sub ?? null])).toEqual([
      ["3 foto dilaporkan", null], ["8 orang belum absen", "Pemaparan departemen · wajib"], ["Silent Meeting belum dibuka", "Buka otomatis 13.00"],
    ]);
    expect(items[2].href).toBe(`${mainWamPath.rundownLive(2)}#sesi-${silent.id}`);
    expect(attentionItems({ modules: { ...modules, absen: false, silent: false }, reported: 0, required: [{ session: pemaparan, present: 112, expected: 120 }], silent: [{ session: silent, day: 2 }] })).toEqual([]);
    expect(attentionItems({ modules, reported: 0, required: [{ session: pemaparan, present: 120, expected: 120 }], silent: [] })).toEqual([]);
  });

  it("names the sessions running now (started, not ended), none before the first or after the last", () => {
    const now = runningSessions(sampleSessions, at("10:15"));
    expect(now.map(session => session.title)).toEqual(["Pemaparan departemen"]);
    expect(now[0].time).toBe("08.00–12.00");
    expect(now[0].href).toBe(`${mainWamPath.rundownLive()}#sesi-${now[0].id}`);
    expect(runningSessions(sampleSessions, at("03:00"))).toEqual([]);
    expect(runningSessions(sampleSessions.map(session => ({ ...session, status: "batal" as const })), at("10:15"))).toEqual([]);
  });
});

describe("API input", () => {
  it("accepts a change of time with the sessions that move, and refuses what it does not know", () => {
    const ok = rundownChangeSchema.safeParse({ action: "jam", version: "2027-01-05T03:20:00.123456+00:00", startsAt: at("08:00").toISOString(), endsAt: at("12:30").toISOString(), shift: [{ id: sampleSessionIds.silent, version: "2027-01-05T03:20:00+00:00" }], notify: true });
    expect(ok.success).toBe(true);
    expect(rundownChangeSchema.safeParse({ action: "hapus", version: "x".repeat(20) }).success).toBe(false);
    expect(rundownChangeSchema.safeParse({ action: "tempat", version: "x".repeat(20), place: " ", notify: false }).success).toBe(false);
    expect(presentSchema.safeParse({ employeeId: "bukan-uuid", present: true }).success).toBe(false);
    expect(moderateSchema.safeParse({ action: "hapus", from: "disembunyikan" }).success).toBe(true);
    expect(moderateSchema.safeParse({ action: "blokir", from: "tampil" }).success).toBe(false);
    // The reason is optional; a quick choice must be one of the list, the note at most 200 characters.
    expect(moderateSchema.parse({ action: "sembunyikan", from: "ditinjau" })).toEqual({ action: "sembunyikan", from: "ditinjau", reason: null, note: "" });
    expect(moderateSchema.parse({ action: "sembunyikan", from: "ditinjau", reason: "tidak_pantas", note: " Ada nomor kamar " })).toMatchObject({ reason: "tidak_pantas", note: "Ada nomor kamar" });
    expect(moderateSchema.safeParse({ action: "sembunyikan", from: "ditinjau", reason: "spam" }).success).toBe(false);
    expect(moderateSchema.safeParse({ action: "hapus", from: "disembunyikan", note: "x".repeat(201) }).error?.issues[0].message).toBe("Catatan paling panjang 200 karakter.");
  });

  it("asks for a title, keeps the limits, and needs a choice of departemen, and no longer takes kelompok", () => {
    const empty = announceSchema.safeParse({ title: "  ", audience: { type: "semua" } });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0].message).toBe("Judul wajib diisi.");
    expect(announceSchema.safeParse({ title: "x".repeat(61), audience: { type: "semua" } }).success).toBe(false);
    expect(announceSchema.safeParse({ title: "Team building mulai 15.00 di Lawn", body: "x".repeat(301), audience: { type: "semua" } }).success).toBe(false);
    expect(announceSchema.safeParse({ title: "Kumpul", audience: { type: "departemen", departments: [] } }).success).toBe(false);
    expect(announceSchema.safeParse({ title: "Kumpul", audience: { type: "kelompok", groupIds: ["a"] } }).success).toBe(false);
    expect(announceSchema.parse({ title: "Kumpul", audience: { type: "panitia" } })).toEqual({ title: "Kumpul", body: "", audience: { type: "panitia" }, pinnedUntil: null });
  });
});
