import { describe, expect, it } from "vitest";
import {
  CAPTION_LIMIT, cut, decisionLines, dueDate, escapeHtml, frmDate, frmDue, frmPosition, frmStamp, frmTime, guestNames, longDate, minutesCaption, minutesCode,
  minutesFileName, stamp, visibleLength, type MinutesMessage,
} from "./minutes-message";

const base: MinutesMessage = {
  code: "SM-20261110-4F3A",
  title: "Appraisal team SS", departmentShort: "SM", department: "Sales & Marketing",
  date: "2026-11-10", from: "11.00", to: "12.30", place: "CFC Ananta Room",
  participants: ["Raja", "Sofyan", "Kayana"], notetaker: "Raja",
  summary: "Penilaian kinerja dibahas per orang.", decisions: "1. KPI Q4 memakai format baru.\n\n2. Evaluasi 15 Desember.",
  actions: [
    { task: "Kirim draf KPI", pic: "Sofyan", dueDate: "2026-11-14", done: false },
    { task: "Rekap nilai Q3", pic: "Kayana", dueDate: null, done: true },
  ],
  version: 1, at: "2026-11-10T06:05:00Z", link: "journey.werkudara.group/wam/sessions/x",
};

describe("dates", () => {
  it("writes the meeting day, a due date and the stamp in Indonesian, WIB", () => {
    expect(longDate("2026-11-10")).toBe("Selasa, 10 November 2026");
    expect(dueDate("2026-11-14")).toBe("Sab, 14 Nov");
    expect(stamp("2026-11-10T06:05:00Z")).toBe("10 Nov 2026, 13.05 WIB");
  });
});

describe("form FRM.05.00.00.027's words", () => {
  it("writes dates and times as the form does: dd MMM. yy, d-MMM-yy, HH:MM WIB", () => {
    expect(frmDate("2026-08-07")).toBe("07 Aug. 26");
    expect(frmDate("2026-11-12T00:00:00Z")).toBe("12 Nov. 26");
    expect(frmDue("2026-11-20")).toBe("20-Nov-26");
    expect(frmDue("2026-09-04")).toBe("4-Sep-26");
    expect(frmTime("09.00")).toBe("09:00 WIB");
    expect(frmTime("14:45")).toBe("14:45 WIB");
    expect(frmStamp("2026-11-12T06:05:00Z")).toBe("12 Nov 2026, 13:05 WIB");
    expect(frmStamp("2026-09-01T00:00:00Z")).toBe("1 Sep 2026, 07:00 WIB");
  });

  it("names a position from the form's list: BOD, then GM or HOD, Lead, else Staff", () => {
    expect(frmPosition(true, ["staf"])).toBe("Board of Director");
    expect(frmPosition(false, ["staf", "gm"])).toBe("Head of Department");
    expect(frmPosition(false, ["hod"])).toBe("Head of Department");
    expect(frmPosition(false, ["lead", "staf"])).toBe("Coordinator");
    expect(frmPosition(false, ["staf"])).toBe("Staff");
    expect(frmPosition(false, [])).toBe("");
  });

  it("reads others who came as one name each", () => {
    expect(guestNames(" Pak Andi (klien), Bu Sari;\nTim vendor ,")).toEqual(["Pak Andi (klien)", "Bu Sari", "Tim vendor"]);
    expect(guestNames(null)).toEqual([]);
  });
});

describe("the MoM's code and file", () => {
  it("is the short form, the day and four characters of the session, the same for every version", () => {
    expect(minutesCode("CoE", "2026-11-12", "4f3a9c2e-1111-4111-8111-111111111111")).toBe("CoE-20261112-4F3A");
    expect(minutesCode("S&M", "2026-11-12", "ab-cd")).toBe("SM-20261112-ABCD");
    expect(minutesCode("", "2026-11-12", "x1y2")).toBe("WAM-20261112-X1Y2");
    expect(minutesFileName(base)).toBe("MoM_SM-20261110-4F3A_v1.pdf");
    expect(minutesFileName({ ...base, version: 3, trial: true })).toBe("MoM_SM-20261110-4F3A_v3_UJI.pdf");
  });
});

describe("minutesCaption", () => {
  it("reads at a glance, without icons: title, kind and department, number, time, place, notetaker, attendance, decisions, open follow-ups, version", () => {
    const caption = minutesCaption(base);
    expect(caption.split("\n")).toEqual([
      "<b>Appraisal team SS</b>",
      "Minutes of Meeting · Sales &amp; Marketing",
      "",
      "Kode: SM-20261110-4F3A",
      "Waktu: Selasa, 10 November 2026, 11.00–12.30 WIB",
      "Tempat: CFC Ananta Room",
      "Notulis: Raja",
      "Kehadiran: 3 peserta",
      "",
      "<b>Keputusan</b>",
      "1. KPI Q4 memakai format baru.",
      "2. Evaluasi 15 Desember.",
      "",
      "<b>Tindak lanjut</b>",
      "1. Kirim draf KPI (Sofyan, 14 Nov)",
      "1 sudah selesai.",
    ]);
    // No closing line about the PDF or when it was sent.
    expect(caption).not.toContain("PDF terlampir");
    expect(caption).not.toContain("Dikirim");
    // No icons, and neutral when forwarded to a superior.
    expect(caption).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(caption).not.toMatch(/\bkamu\b/i);
  });

  it("escapes what people typed, marks a sample and a later version, and stays under Telegram's limit", () => {
    const caption = minutesCaption({ ...base, title: "Q&A <draft>", trial: true, version: 3, changedBy: "Sofyan", at: "2026-11-11T02:10:00Z", actions: [], from: null, to: null });
    expect(caption).toContain("<b>Q&amp;A &lt;draft&gt;</b>");
    expect(caption).toContain("<i>Uji coba dari WAM, bukan meeting sungguhan.</i>");
    expect(caption).not.toContain("Versi 3");
    expect(caption).toContain("Waktu: Selasa, 10 November 2026\n");
    expect(caption).not.toContain("Tindak lanjut");
    const many = Array.from({ length: 12 }, (_, index) => `Keputusan panjang nomor ${index + 1} `.repeat(6));
    const long = minutesCaption({
      ...base, title: "Judul ".repeat(100), place: "Tempat ".repeat(60), department: "D".repeat(150), notetaker: "N".repeat(150), changedBy: "C".repeat(150), version: 2,
      decisions: many.join("\n"), actions: many.map(task => ({ task, pic: "P".repeat(40), dueDate: "2026-11-20", done: false })),
    });
    expect(visibleLength(long)).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(long).toContain("lainnya (lihat PDF)");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("with the FRM form: the number, the chair, who came, decisions from every item (three shown), and photos", () => {
    const caption = minutesCaption({
      ...base, code: "MoM/2026/11/0012", chair: "Sofyan", photoCount: 3,
      items: [{ topic: "KPI", discussion: "Bahas", decision: "Format baru\nEvaluasi Desember", added: false }, { topic: "Seragam", discussion: "Usulan", decision: "- Seragam biru\n2) Ukuran dicek", added: true }],
      attendance: [{ name: "Raja", department: "SM", position: "HOD", present: true }, { name: "Sofyan", department: "SM", position: "Staff", present: true }, { name: "Kayana", department: "SM", position: "Staff", present: false }],
    });
    expect(caption).toContain("Nomor: MoM/2026/11/0012");
    expect(caption).toContain("Pimpinan: Sofyan\nNotulis: Raja\nKehadiran: 2 dari 3 hadir");
    expect(caption).toContain("<b>Keputusan</b>\n1. Format baru\n2. Evaluasi Desember\n3. Seragam biru\ndan 1 lainnya (lihat PDF)");
    expect(minutesCaption({ ...base, actions: [{ task: "Selesai", pic: null, dueDate: null, done: true }] })).toContain("<b>Tindak lanjut</b>\nSemua sudah selesai.");
    expect(minutesFileName({ code: "MoM/2026/11/0012", version: 2 })).toBe("MoM-2026-11-0012_v2.pdf");
  });

  it("with a nomor surat typed: it is the number in the caption and the file name, slashes and unsafe characters made safe", () => {
    const typed = { ...base, code: "001/MoM/BAS/XI/2026", numbered: true };
    expect(minutesCaption(typed)).toContain("Nomor: 001/MoM/BAS/XI/2026");
    expect(minutesCaption(typed)).not.toContain("Kode:");
    expect(minutesFileName({ ...typed, version: 2 })).toBe("001-MoM-BAS-XI-2026_v2.pdf");
    expect(minutesFileName({ ...typed, trial: true })).toBe("001-MoM-BAS-XI-2026_v1_UJI.pdf");
    expect(minutesFileName({ code: "  02 / MoM: \"BAS\" <XI>|2026 ", version: 1, numbered: true })).toBe("02-MoM-BAS-XI-2026_v1.pdf");
    expect(minutesFileName({ code: "///", version: 1, numbered: true })).toBe("MoM_v1.pdf");
    // `numbered` says so, whatever the shape: a fallback code stays a code, as before.
    expect(minutesCaption({ ...base, code: "MoM/2026/11/0012", numbered: false })).toContain("Kode: MoM/2026/11/0012");
    expect(minutesFileName({ code: "SM-20261110-4F3A", version: 1, numbered: false })).toBe("MoM_SM-20261110-4F3A_v1.pdf");
  });

  it("counts decisions by line, skipping empty ones", () => {
    expect(decisionLines("1. Satu\n\n 2. Dua \n")).toEqual(["1. Satu", "2. Dua"]);
  });
});

describe("cut", () => {
  it("ends at a sentence or a word, never mid-word", () => {
    expect(cut("Satu dua tiga. Empat lima enam tujuh.", 20)).toBe("Satu dua tiga.…");
    expect(cut("katapanjang sekali tanpa titik di sini", 22)).toBe("katapanjang sekali…");
    expect(cut("pendek", 20)).toBe("pendek");
  });
});
