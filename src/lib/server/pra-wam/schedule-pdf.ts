import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import { slotLabel, stampLabel, type ExportDay } from "@/lib/pra-wam/schedule-export";
import { pdfSafe } from "../beo-pdf";

/*
 * Linimasa's export as PDF (10 Nov 2026): A4, a heading per day, then each meeting with its place
 * and its times, the way the WhatsApp text reads. New pages as the list grows.
 */

const A4 = { width: 595.28, height: 841.89 };
const BLUE = rgb(0.082, 0.318, 0.627), INK = rgb(0.18, 0.17, 0.17), MUTED = rgb(0.42, 0.4, 0.4), LINE = rgb(0.86, 0.85, 0.83);
const MARGIN = 48, WIDTH = A4.width - MARGIN * 2;

function lines(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of pdfSafe(text).split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

export async function schedulePdf(days: readonly ExportDay[], range: string, now: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`Jadwal meeting ${range}`));
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const write = (text: string, font: PDFFont, size: number, color = INK, x = MARGIN) => { page.drawText(text, { x, y, size, font, color }); };
  const room = (height: number) => {
    if (y - height >= MARGIN + 20) return;
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };

  write("Jadwal meeting", bold, 20, BLUE); y -= 20;
  write(pdfSafe(range), regular, 11, MUTED); y -= 28;

  if (!days.length) { write("Belum ada meeting terbit pada rentang ini.", regular, 11); y -= 20; }
  for (const day of days) {
    room(48);
    write(pdfSafe(`${dayLabel(day.date)} ${day.date.slice(0, 4)}`), bold, 13, BLUE); y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.75, color: LINE }); y -= 16;
    for (const item of day.items) {
      const title = lines(item.title, bold, 11, WIDTH);
      const where = lines(item.place, regular, 10, WIDTH);
      const times = lines(item.slots.map(slotLabel).join("  &  "), regular, 10, WIDTH);
      room((title.length + where.length + times.length) * 14 + 8);
      for (const line of title) { write(line, bold, 11); y -= 14; }
      for (const line of where) { write(line, regular, 10, MUTED); y -= 13; }
      for (const line of times) { write(line, regular, 10); y -= 13; }
      y -= 8;
    }
    y -= 8;
  }
  const stamp = pdfSafe(`Update per ${stampLabel(now)}`);
  for (const [index, each] of pdf.getPages().entries()) {
    each.drawText(stamp, { x: MARGIN, y: 28, size: 8, font: regular, color: MUTED });
    const number = `${index + 1}/${pdf.getPageCount()}`;
    each.drawText(number, { x: A4.width - MARGIN - regular.widthOfTextAtSize(number, 8), y: 28, size: 8, font: regular, color: MUTED });
  }
  return pdf.save();
}
