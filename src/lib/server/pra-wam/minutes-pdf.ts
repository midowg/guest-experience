import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { decisionLines, dueDate, longDate, stamp, type MinutesMessage } from "@/lib/pra-wam/minutes-message";
import { pdfSafe } from "../beo-pdf";

/*
 * A MoM as a PDF (12 Nov 2026): what goes to Telegram and what "Unduh PDF" gives. A4: the code and
 * meeting, then who, when and where, the summary, the decisions, and the follow-ups as a table
 * (task, PIC, due, Open/Done). The code and version stand in every page's foot, so a forwarded
 * copy says which MoM and which version it is.
 */

const A4 = { width: 595.28, height: 841.89 };
const BLUE = rgb(0.082, 0.318, 0.627), INK = rgb(0.18, 0.17, 0.17), MUTED = rgb(0.42, 0.4, 0.4), LINE = rgb(0.86, 0.85, 0.83), WARN = rgb(0.65, 0.2, 0.1);
const MARGIN = 48, WIDTH = A4.width - MARGIN * 2;

/** Wraps text to a width, keeping its own line breaks. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of pdfSafe(paragraph).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

export async function minutesPdf(message: MinutesMessage): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`MoM ${message.code} ${message.title}`));
  pdf.setSubject(pdfSafe(`Notulen meeting, versi ${Math.max(1, message.version)}`));
  pdf.setProducer("WAM Werkudara");
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const room = (height: number) => {
    if (y - height >= MARGIN + 24) return;
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };
  const text = (value: string, font: PDFFont, size: number, color = INK, x = MARGIN) => page.drawText(value, { x, y, size, font, color });
  const paragraph = (value: string, font: PDFFont, size: number, color = INK, x = MARGIN, width = WIDTH) => {
    for (const line of wrap(value, font, size, width)) { room(size + 4); text(line, font, size, color, x); y -= size + 4; }
  };
  const rule = () => { page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.75, color: LINE }); };
  const heading = (value: string) => { y -= 10; room(40); text(value, bold, 12, BLUE); y -= 8; rule(); y -= 16; };

  text("NOTULEN RAPAT (MINUTES OF MEETING)", bold, 10, MUTED); y -= 22;
  paragraph(message.title, bold, 18, BLUE);
  text(pdfSafe(`Kode ${message.code} · Versi ${Math.max(1, message.version)}`), regular, 10, MUTED); y -= 16;
  if (message.trial) { text("UJI COBA dari WAM, bukan meeting sungguhan.", bold, 10, WARN); y -= 16; }
  y -= 6;

  // Who, when and where, as label and value.
  const facts: [string, string][] = [
    ["Departemen", message.department],
    ["Hari, tanggal", longDate(message.date)],
    ["Waktu", message.from && message.to ? `${message.from}–${message.to} WIB` : "-"],
    ["Tempat", message.place || "-"],
    ["Notulis", message.notetaker ?? "-"],
    [`Peserta (${message.participants.length})`, message.participants.join(", ") || "-"],
  ];
  for (const [label, value] of facts) {
    const lines = wrap(value, regular, 10, WIDTH - 110);
    room(lines.length * 14 + 4);
    text(pdfSafe(label), bold, 10, MUTED);
    for (const line of lines) { text(line, regular, 10, INK, MARGIN + 110); y -= 14; }
    y -= 2;
  }

  if (message.summary.trim()) { heading("Ringkasan"); paragraph(message.summary.trim(), regular, 10.5); }
  const decisions = decisionLines(message.decisions);
  if (decisions.length) {
    heading("Keputusan");
    for (const line of decisions) { paragraph(line, regular, 10.5); y -= 2; }
  }

  if (message.actions.length) {
    heading("Tindak lanjut");
    const columns = [{ label: "No", x: MARGIN, width: 22 }, { label: "Tugas", x: MARGIN + 24, width: 240 }, { label: "PIC", x: MARGIN + 270, width: 110 },
      { label: "Tenggat", x: MARGIN + 384, width: 70 }, { label: "Status", x: MARGIN + 456, width: 44 }];
    room(18);
    for (const column of columns) text(column.label, bold, 9, MUTED, column.x);
    y -= 14;
    message.actions.forEach((action, index) => {
      const cells = [String(index + 1), action.task, action.pic ?? "-", action.dueDate ? dueDate(action.dueDate) : "-", action.done ? "Done" : "Open"];
      const wrapped = cells.map((cell, at) => wrap(cell, regular, 9.5, columns[at].width));
      const height = Math.max(...wrapped.map(lines => lines.length)) * 13 + 6;
      room(height);
      page.drawLine({ start: { x: MARGIN, y: y + 11 }, end: { x: A4.width - MARGIN, y: y + 11 }, thickness: 0.5, color: LINE });
      const top = y;
      wrapped.forEach((lines, at) => {
        y = top;
        for (const line of lines) { text(line, at === 4 && !action.done ? bold : regular, 9.5, INK, columns[at].x); y -= 13; }
      });
      y = top - height + 6;
    });
  }

  const foot = pdfSafe(`MoM ${message.code} · Versi ${Math.max(1, message.version)} · ${message.version > 1 ? "diperbarui" : "dikirim"} ${stamp(message.at)} lewat WAM`);
  for (const [index, each] of pdf.getPages().entries()) {
    each.drawText(foot, { x: MARGIN, y: 28, size: 8, font: regular, color: MUTED });
    const number = `${index + 1}/${pdf.getPageCount()}`;
    each.drawText(number, { x: A4.width - MARGIN - regular.widthOfTextAtSize(number, 8), y: 28, size: 8, font: regular, color: MUTED });
  }
  return pdf.save();
}
