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
  it("says only what tells the MoM apart: code, meeting, department in full, day, hours, place, notetaker, counts, version", () => {
    const caption = minutesCaption(base);
    expect(caption).toContain("📝 <b>MoM · SM · Appraisal team SS</b>");
    expect(caption).toContain("Kode: <code>SM-20261110-4F3A</code>");
    expect(caption).toContain("Sales &amp; Marketing · Selasa, 10 November 2026");
    expect(caption).toContain("11.00–12.30 WIB · CFC Ananta Room");
    expect(caption).toContain("Notulis: Raja · 3 peserta");
    expect(caption).toContain("2 keputusan · 2 tindak lanjut (1 belum selesai)");
    expect(caption).toContain("Detail lengkap ada di PDF terlampir.");
    expect(caption).toContain("<i>Versi 1 · dikirim 10 Nov 2026, 13.05 WIB lewat WAM</i>");
    // The text of the MoM itself stays in the PDF.
    expect(caption).not.toContain("Penilaian kinerja");
    expect(caption).not.toContain("Kirim draf KPI");
    expect(caption).not.toMatch(/\bkamu\b/i);
  });

  it("escapes what people typed, marks a sample and a later version, and stays under Telegram's limit", () => {
    const caption = minutesCaption({ ...base, title: "Q&A <draft>", trial: true, version: 3, changedBy: "Sofyan", at: "2026-11-11T02:10:00Z", actions: [], from: null, to: null });
    expect(caption).toContain("MoM · SM · Q&amp;A &lt;draft&gt;");
    expect(caption).toContain("<i>UJI COBA dari WAM, bukan meeting sungguhan.</i>");
    expect(caption).toContain("Versi 3 · diperbarui 11 Nov 2026, 09.10 WIB oleh Sofyan");
    expect(caption).toContain("0 tindak lanjut");
    expect(caption).toContain("\nCFC Ananta Room\n");
    const long = minutesCaption({ ...base, title: "Judul ".repeat(100), place: "Tempat ".repeat(60), department: "D".repeat(150), notetaker: "N".repeat(150), changedBy: "C".repeat(150), version: 2 });
    expect(visibleLength(long)).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("with the FRM form: the number, the chair, who came, topics and decisions per item, and photos", () => {
    const caption = minutesCaption({
      ...base, code: "MoM/2026/11/0012", chair: "Sofyan", photoCount: 3,
      items: [{ topic: "KPI", discussion: "Bahas", decision: "Format baru\nEvaluasi Desember", added: false }, { topic: "Seragam", discussion: "Usulan", decision: "", added: true }],
      attendance: [{ name: "Raja", department: "SM", position: "HOD", present: true }, { name: "Sofyan", department: "SM", position: "Staff", present: true }, { name: "Kayana", department: "SM", position: "Staff", present: false }],
    });
    expect(caption).toContain("No.: <code>MoM/2026/11/0012</code>");
    expect(caption).toContain("Pimpinan: Sofyan · Notulis: Raja · 2 dari 3 hadir");
    expect(caption).toContain("2 topik · 2 keputusan · 2 tindak lanjut (1 belum selesai) · 3 foto");
    expect(minutesFileName({ code: "MoM/2026/11/0012", version: 2 })).toBe("MoM-2026-11-0012_v2.pdf");
  });

  it("with a nomor surat typed: it is the number in the caption and the file name, slashes and unsafe characters made safe", () => {
    const typed = { ...base, code: "001/MoM/BAS/XI/2026", numbered: true };
    expect(minutesCaption(typed)).toContain("No.: <code>001/MoM/BAS/XI/2026</code>");
    expect(minutesCaption(typed)).not.toContain("Kode:");
    expect(minutesFileName({ ...typed, version: 2 })).toBe("001-MoM-BAS-XI-2026_v2.pdf");
    expect(minutesFileName({ ...typed, trial: true })).toBe("001-MoM-BAS-XI-2026_v1_UJI.pdf");
    expect(minutesFileName({ code: "  02 / MoM: \"BAS\" <XI>|2026 ", version: 1, numbered: true })).toBe("02-MoM-BAS-XI-2026_v1.pdf");
    expect(minutesFileName({ code: "///", version: 1, numbered: true })).toBe("MoM_v1.pdf");
    // `numbered` says so, whatever the shape: a fallback code stays a code, as before.
    expect(minutesCaption({ ...base, code: "MoM/2026/11/0012", numbered: false })).toContain("Kode: <code>MoM/2026/11/0012</code>");
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
