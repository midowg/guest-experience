import { describe, expect, it } from "vitest";
import { sampleSession, sampleSessions } from "../sample";
import { sampleAdminPeople } from "./sample";
import {
  blankSession, changeNote, deleteRefusal, IN_USE_REFUSAL, inputTimes, keepsData, lineupFromText, lineupToText, listWords, minutesLabel, overlaps, parseRundownPaste,
  scheduleChanges, sessionInputSchema, sessionRow, sessionToInput, shiftConflict, shifted, shiftNote, shiftSchema, usageWords,
} from "./rundown";
import { sessionsPostSchema } from "./requests";

const DATES = ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"];
const ctx = { dates: DATES, people: sampleAdminPeople, existing: [] };

describe("session input", () => {
  const valid = { ...blankSession("2027-01-05"), title: "Pemaparan departemen", start: "08:00", end: "12:00" };
  it("accepts a whole session and keeps WIB clock times as instants", () => {
    expect(sessionInputSchema.safeParse(valid).success).toBe(true);
    expect(inputTimes(valid)).toEqual({ startsAt: "2027-01-05T01:00:00.000Z", endsAt: "2027-01-05T05:00:00.000Z" });
    expect(sessionRow({ ...valid, end: null }).ends_at).toBeNull();
  });
  it("refuses the database's rules before the database does", () => {
    const issues = (input: object) => sessionInputSchema.safeParse({ ...valid, ...input }).error?.issues.map(issue => issue.message) ?? [];
    expect(issues({ end: "07:00" })).toContain("Jam selesai harus setelah jam mulai.");
    expect(issues({ kind: "makan", usesAttendance: true })).toContain("Sesi makan tidak memakai absen.");
    expect(issues({ required: true, usesAttendance: false })).toContain("Sesi wajib harus memakai absen.");
    expect(issues({ title: "A" })).toContain("Tulis judul sesi.");
    expect(issues({ start: "8.00" })).toContain("Tulis jam mulai, misalnya 08.00.");
    expect(issues({ module: "komitmen" })).toContain("Modul tidak dikenali.");
    expect(issues({ lineup: Array.from({ length: 41 }, () => ({ time: "", label: "x" })) })).toContain("Urutan tampil paling banyak 40 baris.");
  });
  it("round-trips a saved session through the form", () => {
    const session = sampleSession("pemaparan");
    const input = sessionToInput(session);
    expect(input).toMatchObject({ date: "2027-01-05", start: "08:00", end: "12:00", required: true, usesAttendance: true });
    expect(new Date(inputTimes(input).startsAt).getTime()).toBe(Date.parse(session.startsAt));
  });
  it("reads urutan tampil one line per turn", () => {
    expect(lineupFromText("08.00 Sales & Marketing\n8:40 - CoE\n\nTanya jawab")).toEqual([
      { time: "08.00", label: "Sales & Marketing" }, { time: "08.40", label: "CoE" }, { time: "", label: "Tanya jawab" }]);
    expect(lineupToText([{ time: "08.00", label: "Sales" }, { time: "", label: "Rehat" }])).toBe("08.00 Sales\nRehat");
  });
});

describe("changes after publishing", () => {
  const before = sampleSession("pemaparan");
  it("logs time, place and status of a published session, never a draft's", () => {
    const after = { ...before, endsAt: "2027-01-05T05:30:00.000Z", place: "Aula 2" };
    expect(scheduleChanges(before, after)).toEqual([
      { field: "endsAt", from: before.endsAt, to: after.endsAt }, { field: "place", from: "Aula Utama · lantai 1", to: "Aula 2" }]);
    // The same instant written differently is no change.
    expect(scheduleChanges(before, { ...before, startsAt: "2027-01-05T08:00:00+07:00" })).toEqual([]);
    expect(scheduleChanges({ ...before, status: "draf" }, { ...after, status: "terbit" })).toEqual([]);
    expect(scheduleChanges(before, { ...before, status: "batal" })).toEqual([{ field: "status", from: "terbit", to: "batal" }]);
  });
  it("words the note participants get", () => {
    expect(changeNote(before, { ...before, endsAt: "2027-01-05T05:30:00.000Z" }).body).toBe("Pemaparan departemen: 08.00–12.30 (tadinya 08.00–12.00).");
    expect(changeNote(before, { ...before, place: "Ballroom" }).body).toBe("Pemaparan departemen: Ballroom (tadinya Aula Utama · lantai 1).");
    expect(changeNote(before, { ...before, status: "batal" }).body).toBe("Pemaparan departemen dibatalkan.");
    expect(changeNote(before, { ...before, status: "batal" }).title).toBe("Jadwal berubah");
  });
});

describe("geser jam", () => {
  it("moves start and end together and labels the shift", () => {
    const moved = shifted(sampleSession("pemaparan"), 30);
    expect([moved.startsAt, moved.endsAt]).toEqual(["2027-01-05T01:30:00.000Z", "2027-01-05T05:30:00.000Z"]);
    expect(shifted(sampleSession("shuttle"), -15).endsAt).toBeNull();
    expect(minutesLabel(30)).toBe("+30 menit");
    expect(minutesLabel(-75)).toBe("−1 jam 15 menit");
    expect(minutesLabel(120)).toBe("+2 jam");
  });
  it("tells one or many sessions in one note", () => {
    expect(shiftNote([sampleSession("silent")], 30).body).toBe("Silent Meeting mundur 30 menit: 13.30–15.00.");
    expect(shiftNote([sampleSession("team-building"), sampleSession("makan-siang-2")], -15).body).toBe("2 sesi maju 15 menit, mulai Makan siang 11.45–12.45.");
  });
  it("accepts 5-minute steps up to 12 hours, never zero, each session with the version the page saw (audit S7)", () => {
    const id = sampleSession("silent").id;
    const items = [{ id, version: "2026-12-01T00:00:00.123456+00:00" }];
    expect(shiftSchema.safeParse({ items, minutes: 30, notify: true }).success).toBe(true);
    for (const minutes of [0, 7, 725, -800]) expect(shiftSchema.safeParse({ items, minutes, notify: false }).success).toBe(false);
    expect(shiftSchema.safeParse({ items: [], minutes: 30, notify: false }).success).toBe(false);
    // Without versions, or the same session twice: refused.
    expect(shiftSchema.safeParse({ ids: [id], minutes: 30, notify: false }).success).toBe(false);
    expect(shiftSchema.safeParse({ items: [{ id, version: "" }], minutes: 30, notify: false }).success).toBe(false);
    expect(shiftSchema.safeParse({ items: [...items, ...items], minutes: 30, notify: false }).success).toBe(false);
  });
  it("says a refused Geser jam plainly, naming the session when known", () => {
    expect(shiftConflict("Pemaparan departemen")).toBe("Pemaparan departemen baru saja diubah orang lain (mungkin lewat Rundown live), jadi tidak ada yang digeser. Muat ulang halaman untuk melihat jam terbarunya, lalu geser lagi.");
    expect(shiftConflict()).toMatch(/^Ada sesi yang baru saja diubah orang lain/);
  });
  it("flags sessions that overlap in the same place (meals and cancelled left out)", () => {
    const pemaparan = sampleSession("pemaparan");
    const clash = { ...sampleSession("silent"), id: "x", startsAt: "2027-01-05T04:00:00.000Z", place: pemaparan.place };
    expect([...overlaps([pemaparan, clash])].sort()).toEqual([pemaparan.id, "x"].sort());
    expect(overlaps([pemaparan, { ...clash, status: "batal" }]).size).toBe(0);
    expect(overlaps(sampleSessions).size).toBe(0);
  });
});

describe("impor rundown", () => {
  it("reads a sheet with a header in any order, row by row", () => {
    const paste = [
      "Judul\tHari\tMulai\tSelesai\tTempat\tJenis\tAbsen\tWajib\tModul\tKontak\tStatus\tUrutan tampil",
      "Pemaparan departemen\t2\t08.00\t12.00\tAula Utama\tSesi\tya\tya\t\tDimas Contoh\tTerbit\t08.00 Sales; 08.40 CoE",
      "Makan siang\tHari 2\t12.00\t13.00\tResto\tMakan\t\t\t\t\t\t",
      "Silent Meeting\tSel, 5 Jan\t13.00\t14.30\tAula Utama\t\tya\t\tSilent Meeting\t\tdraf\t",
    ].join("\n");
    const result = parseRundownPaste(paste, ctx);
    expect(result.header).toBe(true);
    expect(result.rows.map(row => row.errors)).toEqual([[], [], []]);
    expect(result.rows[0].input).toMatchObject({ title: "Pemaparan departemen", date: "2027-01-05", start: "08:00", end: "12:00", usesAttendance: true, required: true, status: "terbit",
      contactId: sampleAdminPeople.find(person => person.fullName === "Dimas Contoh")!.id, lineup: [{ time: "08.00", label: "Sales" }, { time: "08.40", label: "CoE" }] });
    expect(result.rows[1].input).toMatchObject({ kind: "makan", usesAttendance: false, status: "draf" });
    expect(result.rows[2].input).toMatchObject({ module: "silent", status: "draf" });
    expect(result.rows[0].line).toBe(2);
  });
  it("uses the documented order without a header", () => {
    const result = parseRundownPaste("1\t17.00\t18.00\tPembukaan\tAula Utama", ctx);
    expect(result.header).toBe(false);
    expect(result.rows[0].input).toMatchObject({ date: "2027-01-04", start: "17:00", title: "Pembukaan", place: "Aula Utama" });
  });
  it("says what is wrong with each row and saves nothing of it", () => {
    const paste = ["Hari\tMulai\tSelesai\tJudul\tAbsen\tKontak\tJenis", "9\t25.00\t\t\tmungkin\tBudi\tRapat", "2\t08.00\t07.00\tTerbalik\t\t\t", "2\t12.00\t13.00\tMakan\tya\t\tmakan"].join("\n");
    const rows = parseRundownPaste(paste, ctx).rows;
    expect(rows[0].input).toBeNull();
    expect(rows[0].errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Hari "9" bukan hari acara/), expect.stringMatching(/^Jam mulai "25.00"/), "Absen \"mungkin\": tulis ya atau tidak.",
      expect.stringMatching(/^Kontak: Budi tidak ada/), expect.stringMatching(/^Jenis "Rapat"/), "Judul kosong."]));
    expect(rows[1].errors).toEqual(["Jam selesai harus setelah jam mulai."]);
    expect(rows[2].errors).toEqual([]);
    expect(rows[2].input?.usesAttendance).toBe(false);
  });
  it("refuses a session twice, in the paste or already in the rundown", () => {
    const paste = "2\t08.00\t12.00\tPemaparan departemen\n2\t08.00\t12.00\tpemaparan  departemen";
    expect(parseRundownPaste(paste, ctx).rows[1].errors).toEqual(["Sama dengan baris 1."]);
    expect(parseRundownPaste(paste, { ...ctx, existing: [sampleSession("pemaparan")] }).rows[0].errors[0]).toMatch(/sudah ada di rundown/);
  });
  it("is what the server accepts", () => {
    const input = parseRundownPaste("2\t08.00\t12.00\tPemaparan", ctx).rows[0].input!;
    expect(sessionsPostSchema.safeParse({ action: "impor", sessions: [input] }).success).toBe(true);
    expect(sessionsPostSchema.safeParse({ action: "impor", sessions: [] }).success).toBe(false);
    expect(sessionsPostSchema.safeParse({ action: "hapus-semua" }).success).toBe(false);
  });
});

describe("Hapus or Batalkan (audit M4)", () => {
  const none = { attendance: 0, photos: 0, silent: false, awards: 0, activityGroups: 0 };
  it("lists in Indonesian", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["a"])).toBe("a");
    expect(listWords(["a", "b"])).toBe("a dan b");
    expect(listWords(["a", "b", "c"])).toBe("a, b, dan c");
  });
  it("names what keeps a session, kelompok kegiatan not among them", () => {
    expect(usageWords({ ...none, attendance: 1240, photos: 3, silent: true, awards: 2 })).toBe("1.240 absen, 3 foto Momen, pertanyaan Silent Meeting, dan 2 kategori Awarding");
    expect(keepsData({ ...none, activityGroups: 6 })).toBe(false);
    expect(keepsData({ ...none, silent: true })).toBe(true);
    expect(keepsData(null)).toBe(false);
  });
  it("refuses with what it has and the way out", () => {
    expect(deleteRefusal({ ...none, attendance: 12 })).toBe("Sesi ini sudah punya 12 absen. Pakai Batalkan.");
    expect(IN_USE_REFUSAL).toBe("Sesi ini sudah punya absen, foto, Silent Meeting, atau Awarding. Pakai Batalkan.");
  });
});
