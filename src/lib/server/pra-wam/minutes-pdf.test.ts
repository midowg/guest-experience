import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
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

  it("follows the FRM form: number in the title, agenda tables, attendance list, and the photos", async () => {
    const frm: MinutesMessage = {
      ...message, code: "MoM/2026/11/0012", chair: "Raja Pratama", guests: "Pak Andi (klien)",
      items: [
        { topic: "Onboarding", discussion: "Tahap persetujuan paling sering terlambat.", decision: "Persetujuan paling lama 2 hari kerja.", added: false },
        { topic: "Seragam", discussion: "Usulan seragam.", decision: "", added: true },
      ],
      attendance: [
        { name: "Raja Pratama", department: "Center of Excellence", position: "Head of Department", present: true },
        { name: "Sofyan Hadi", department: "Center of Excellence", position: "Staff", present: false },
      ],
      next: { date: "2026-11-24", time: "10:00", place: "Ruang Rapat 1", agenda: "Hasil checklist" },
    };
    const photo = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#2a6fb0" } }).jpeg().toBuffer());
    const bare = await minutesPdf(frm);
    // A photo that is not a JPEG pdf-lib can read is left out; the real one is drawn.
    const withPhotos = await minutesPdf(frm, [photo, new Uint8Array([1, 2, 3]), photo]);
    expect(withPhotos.length).toBeGreaterThan(bare.length + photo.length);
    const pdf = await PDFDocument.load(withPhotos);
    expect(pdf.getTitle()).toBe("MoM/2026/11/0012 Review alur onboarding klien");
    expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
    // A very long discussion runs onto the next pages instead of off the page.
    const long = { ...frm, items: [{ topic: "Panjang", discussion: "Kalimat pembahasan yang panjang sekali. ".repeat(300), decision: "Ya", added: false }] };
    expect((await PDFDocument.load(await minutesPdf(long))).getPageCount()).toBeGreaterThan(2);
  });
});
