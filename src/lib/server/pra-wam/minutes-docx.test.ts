import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { MinutesMessage } from "@/lib/pra-wam/minutes-message";
import { jpegSize, minutesDocx } from "./minutes-docx";

/** The parts of a zip (stored or deflated), by name. */
function unzip(bytes: Uint8Array): Map<string, Buffer> {
  const data = Buffer.from(bytes);
  const parts = new Map<string, Buffer>();
  let at = 0;
  while (data.readUInt32LE(at) === 0x04034b50) {
    const method = data.readUInt16LE(at + 8), size = data.readUInt32LE(at + 18), nameLength = data.readUInt16LE(at + 26), extra = data.readUInt16LE(at + 28);
    const name = data.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const body = data.subarray(at + 30 + nameLength + extra, at + 30 + nameLength + extra + size);
    parts.set(name, method === 8 ? inflateRawSync(body) : Buffer.from(body));
    at += 30 + nameLength + extra + size;
  }
  return parts;
}

const message: MinutesMessage = {
  code: "002/MoM/BO/XI/2026", numbered: true, title: "Koordinasi Q&A <klien>", departmentShort: "BO", department: "Business Operations",
  date: "2026-11-13", from: "09.00", to: "10.00", place: "Ruang Rapat 1", participants: ["Budi", "Andi"], notetaker: "Rina",
  summary: "", decisions: "", version: 2, at: "2026-11-13T03:00:00Z", changedBy: "Rina", link: "journey.werkudara.group/wam/sesi/x",
  chair: "Budi", items: [{ topic: "Venue", discussion: "Dua pilihan.", decision: "Venue A.\nSurvei minggu depan.", added: false }],
  actions: [{ task: "Susun checklist", pic: "Rina, Andi", dueDate: "2026-11-20", done: false }],
  attendance: [{ name: "Budi Santoso", department: "BO", position: "Head of Department", present: true }, { name: "Andi", department: "BO", position: "Staff", present: false }],
  guests: "Pak Hendra", next: { date: "2026-11-24", time: "10:00", place: "Vasuki", agenda: "Hasil survei" },
};
// A 2 x 1 baseline JPEG header: SOI, then SOF0 with height 1, width 2.
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x02, 0x01, 0x01, 0x11, 0x00]);

describe("minutesDocx", () => {
  it("is a Word file with the form's head, its parts in the PDF's words, the link, the foot and the photos", () => {
    const parts = unzip(minutesDocx(message, [jpeg]));
    for (const name of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/header1.xml", "word/footer1.xml", "word/media/logo.png", "word/media/foto1.jpg"]) {
      expect(parts.has(name), name).toBe(true);
    }
    const document = parts.get("word/document.xml")!.toString("utf8");
    for (const text of ["MEETING INFORMATION", "AGENDA ITEMS AND DISCUSSION", "NEW ITEMS/TOPICS", "ACTION ITEMS", "NEXT MEETING", "ATTENDANCE LIST", "DOCUMENTATION", "Rina, Andi", "20-Nov-26", "Pak Hendra"]) {
      expect(document).toContain(text);
    }
    // What people typed is escaped; a decision's lines stay lines.
    expect(document).toContain("Koordinasi Q&amp;A &lt;klien&gt;");
    expect(document).toContain("Venue A.</w:t><w:br/><w:t xml:space=\"preserve\">Survei minggu depan.");
    expect(parts.get("word/_rels/document.xml.rels")!.toString("utf8")).toContain('Target="https://journey.werkudara.group/wam/sesi/x" TargetMode="External"');
    expect(parts.get("word/header1.xml")!.toString("utf8")).toContain("FRM.05.00.00.027");
    expect(parts.get("word/footer1.xml")!.toString("utf8")).toContain("002/MoM/BO/XI/2026 · Version 2 · updated");
  });

  it("leaves out a photo it cannot read, and reads a JPEG's size", () => {
    expect(jpegSize(jpeg)).toEqual({ width: 2, height: 1 });
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
    const parts = unzip(minutesDocx({ ...message, attendance: undefined }, [new Uint8Array([1, 2, 3])]));
    expect(parts.has("word/media/foto1.jpg")).toBe(false);
    expect(parts.get("word/document.xml")!.toString("utf8")).not.toContain("DOCUMENTATION");
  });
});
