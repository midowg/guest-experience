import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { MinutesMessage } from "@/lib/pra-wam/minutes-message";
import { minutesPdf } from "./minutes-pdf";

const message: MinutesMessage = {
  code: "CoE-20261112-4F3A", title: "Review alur onboarding klien", departmentShort: "CoE", department: "Center of Excellence",
  date: "2026-11-12", from: "09.00", to: "10.00", place: "Ruang Rapat 1",
  participants: ["Raja Pratama", "Sofyan Hadi", "Kayana Putri"], notetaker: "Raja Pratama",
  summary: "Alur onboarding klien dibahas – dari brief sampai serah terima.\nTahap persetujuan paling sering terlambat 📌.",
  decisions: "1. Persetujuan paling lama 2 hari kerja.\n2. Checklist dipakai mulai Desember.",
  actions: [
    { task: "Susun checklist onboarding", pic: "Sofyan Hadi", dueDate: "2026-11-20", done: false },
    { task: "Rekap keterlambatan Q3", pic: "Kayana Putri", dueDate: null, done: true },
  ],
  version: 2, at: "2026-11-12T06:05:00Z", changedBy: "Raja Pratama", link: "journey.werkudara.group/wam/sessions/x",
};

describe("minutesPdf", () => {
  it("makes an A4 PDF titled with the code, even with emoji and dashes typed in", async () => {
    const bytes = await minutesPdf(message);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("MoM CoE-20261112-4F3A Review alur onboarding klien");
    const [page] = pdf.getPages();
    expect(Math.round(page.getWidth())).toBe(595);
  });

  it("runs onto more pages for a long MoM", async () => {
    const long = { ...message, summary: "Kalimat yang panjang untuk notulen. ".repeat(400), actions: Array.from({ length: 30 }, (_, index) => ({ task: `Tugas ${index + 1} ${"rinci ".repeat(20)}`, pic: "Peserta", dueDate: "2026-11-20", done: index % 2 === 0 })) };
    const pdf = await PDFDocument.load(await minutesPdf(long));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });
});
