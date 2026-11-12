import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, type PDFPage } from "pdf-lib";
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

/** What a page writes, piece by piece (pdf-lib writes Helvetica text as hex strings). */
function texts(page: PDFPage): string[] {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(ref => page.doc.context.lookup(ref)) : [contents];
  return streams.flatMap(stream => {
    const raw = stream as PDFRawStream;
    const filtered = raw.dict.get(PDFName.of("Filter"));
    const source = Buffer.from(filtered ? inflateSync(raw.contents) : raw.contents).toString("latin1");
    return [...source.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map(match => Buffer.from(match[1], "hex").toString("latin1"));
  });
}

describe("minutesPdf", () => {
  it("is form FRM.05.00.00.027: its head on every page, its sections in order, A4, titled with the code", async () => {
    const pdf = await PDFDocument.load(await minutesPdf(frm));
    expect(pdf.getTitle()).toBe("MoM/2026/11/0012 Review alur onboarding klien");
    expect(pdf.getSubject()).toContain("FRM.05.00.00.027");
    const pages = pdf.getPages();
    expect(Math.round(pages[0].getWidth())).toBe(595);
    for (const page of pages) expect(texts(page)).toEqual(expect.arrayContaining(["FORMULIR", "MINUTES OF MEETING", "No Dok", "FRM.05.00.00.027", "Tgl Efektif", "4-May-26", "Rev", "00", "Level", "4"]));
    const all = pages.flatMap(texts);
    const order = ["I.", "MEETING INFORMATION", "II.", "ATTENDANCE", "III.", "AGENDA ITEMS AND DISCUSSION", "IV.", "NEW ITEMS/TOPICS", "V.", "ACTION ITEMS", "VI.", "NEXT MEETING", "VII.", "ATTENDANCE LIST"];
    expect(order.map(text => all.indexOf(text))).toEqual([...order.map(text => all.indexOf(text))].sort((a, b) => a - b));
    expect(order.every(text => all.includes(text))).toBe(true);
    expect(all).toContain("Last Update/ Review: 4-May-26");
    // The form's values: dates, times, the chair, who came, Open/Done, the next meeting.
    expect(all).toEqual(expect.arrayContaining([
      "MoM/2026/11/0012", "12 Nov. 26", "09:00 WIB", "10:00 WIB", "Chairperson", "Minute Taker", "Raja Pratama, Pak Andi (klien)", "Sofyan Hadi",
      "Topic/Agenda Item", "Onboarding", "Topic Raised", "Seragam", "20-Nov-26", "Open", "Done", "24 Nov. 26", "Hasil checklist",
      "Full Name", "Dept", "Position", "Sign", "Head of Department", "Staff", "Present", "Absent",
    ]));
    // "Can be checked here": the MoM in WAM.
    const link = pages[0].node.Annots()!.lookup(0, PDFDict).lookup(PDFName.of("A"), PDFDict);
    expect((link.lookup(PDFName.of("URI")) as PDFString).decodeText()).toBe("https://journey.werkudara.group/wam/sessions/x");
  });

  it("before the form: the summary and decisions stand as one agenda item, IV says there are no new topics", async () => {
    const pdf = await PDFDocument.load(await minutesPdf({ ...message, actions: [] }));
    expect(pdf.getTitle()).toBe("MoM CoE-20261112-4F3A Review alur onboarding klien");
    const all = pdf.getPages().flatMap(texts);
    expect(all).toEqual(expect.arrayContaining(["Review alur onboarding klien", "No new topics.", "No action items.", "Raja Pratama, Sofyan Hadi, Kayana Putri"]));
  });

  it("marks a sample, and names the version in every page's foot", async () => {
    const pdf = await PDFDocument.load(await minutesPdf({ ...frm, trial: true }));
    const [first] = pdf.getPages();
    expect(texts(first)).toContain("TEST SAMPLE from WAM, not a real meeting");
    expect(texts(first).some(text => text.startsWith("MoM/2026/11/0012 · Version 2 · updated 12 Nov 2026, 13:05 WIB by Raja Pratama via WAM"))).toBe(true);
  });

  it("runs onto more pages for a long MoM", async () => {
    const long = { ...message, summary: "Kalimat yang panjang untuk notulen. ".repeat(400), actions: Array.from({ length: 30 }, (_, index) => ({ task: `Tugas ${index + 1} ${"rinci ".repeat(20)}`, pic: "Peserta", dueDate: "2026-11-20", done: index % 2 === 0 })) };
    const pdf = await PDFDocument.load(await minutesPdf(long));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    // A table's head comes again on the page it runs onto.
    expect(pdf.getPages().filter(page => texts(page).includes("Action Item/Task")).length).toBeGreaterThan(1);
  });

  it("adds the photos as Documentation, and a very long discussion runs on instead of off the page", async () => {
    const photo = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#2a6fb0" } }).jpeg().toBuffer());
    const bare = await minutesPdf(frm);
    // A photo that is not a JPEG pdf-lib can read is left out; the real one is drawn.
    const withPhotos = await minutesPdf(frm, [photo, new Uint8Array([1, 2, 3]), photo]);
    expect(withPhotos.length).toBeGreaterThan(bare.length + photo.length);
    expect((await PDFDocument.load(withPhotos)).getPages().flatMap(texts)).toContain("DOCUMENTATION");
    const long = { ...frm, items: [{ topic: "Panjang", discussion: "Kalimat pembahasan yang panjang sekali. ".repeat(300), decision: "Ya", added: false }] };
    expect((await PDFDocument.load(await minutesPdf(long))).getPageCount()).toBeGreaterThan(2);
  });
});
