import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { BeoDocument } from "@/lib/beo-document";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.17, 0.17, 0.2), MUTED = rgb(0.38, 0.4, 0.45), LINE = rgb(0.86, 0.88, 0.92), SOFT = rgb(0.95, 0.96, 0.98);
const BAND = { vendor: rgb(0.08, 0.32, 0.63), internal: rgb(0.6, 0.15, 0.24) };

// Characters outside Latin-1 that the standard PDF fonts (WinAnsi) still have.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
/** The standard fonts cannot draw every character; others become their plain letter or "?". */
export function pdfSafe(text: string): string {
  const drawable = (char: string) => (char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) <= 0xff) || WIN_ANSI_EXTRA.has(char);
  return [...text.normalize("NFC")].map(char => {
    if (char === "\n" || char === "\t") return " ";
    if (drawable(char)) return char;
    const plain = char.normalize("NFKD").replace(/\p{M}/gu, "");
    return [...plain].every(drawable) && plain ? plain : "?";
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of pdfSafe(paragraph).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) lines.push(line);
      // A single word wider than the column is cut, not allowed to overflow.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut)); rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** The BEO as an A4 PDF, drawn from the same document as the print page. */
export async function beoPdf(doc: BeoDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`BEO · ${doc.title}`));
  pdf.setProducer("Werkudara Journey");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = A4.width - MARGIN * 2;
  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const newPage = () => { page = pdf.addPage([A4.width, A4.height]); y = A4.height - MARGIN; };
  const ensure = (height: number) => { if (y - height < MARGIN) newPage(); };
  const text = (value: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; x?: number; gap?: number } = {}) => {
    const size = options.size ?? 10, font = options.font ?? regular, lineHeight = size * 1.35;
    for (const line of wrap(value, font, size, options.width ?? contentWidth)) {
      ensure(lineHeight);
      page.drawText(line, { x: options.x ?? MARGIN, y: y - size, size, font, color: options.color ?? INK });
      y -= lineHeight;
    }
    y -= options.gap ?? 0;
  };

  // Only the supplier version carries a band, so it is not mistaken for the full sheet.
  if (doc.banner) {
    page.drawRectangle({ x: 0, y: A4.height - 34, width: A4.width, height: 34, color: BAND[doc.version] });
    page.drawText(pdfSafe(doc.banner), { x: MARGIN, y: A4.height - 22, size: 10, font: bold, color: rgb(1, 1, 1) });
    y = A4.height - 34 - 28;
  }

  text("BANQUET EVENT ORDER", { size: 9, font: bold, color: MUTED, gap: 2 });
  text(doc.title, { size: 20, font: bold, gap: 4 });
  text(doc.when, { size: 11 });
  text(doc.place, { size: 11, color: MUTED });
  text(`Status: ${doc.status}`, { size: 10, color: MUTED, gap: 14 });

  // Numbers as boxes in one row.
  const boxWidth = (contentWidth - (doc.numbers.length - 1) * 10) / doc.numbers.length;
  ensure(64);
  doc.numbers.forEach((item, index) => {
    const x = MARGIN + index * (boxWidth + 10);
    page.drawRectangle({ x, y: y - 60, width: boxWidth, height: 60, color: item.main ? SOFT : rgb(1, 1, 1), borderColor: item.main ? BAND.vendor : LINE, borderWidth: item.main ? 1.5 : 1 });
    page.drawText(pdfSafe(item.label), { x: x + 10, y: y - 16, size: 8.5, font: regular, color: MUTED });
    page.drawText(pdfSafe(item.value), { x: x + 10, y: y - 40, size: item.value.length > 6 ? 14 : 22, font: bold, color: INK });
    if (item.note) page.drawText(pdfSafe(item.note), { x: x + 10, y: y - 53, size: 7, font: regular, color: MUTED });
  });
  y -= 78;

  if (doc.notes) {
    text("Catatan", { size: 12, font: bold, gap: 2 });
    text(doc.notes, { size: 10, gap: 12 });
  }

  const draw = (table: { title: string; note?: string; columns: string[]; rows: string[][]; empty: string }, header = true) => {
    ensure(48);
    text(table.title, { size: 12, font: bold, gap: 2 });
    if (table.note) text(table.note, { size: 8.5, color: MUTED, gap: 2 });
    if (!table.rows.length) { text(table.empty, { size: 10, color: MUTED, gap: 12 }); return; }
    // The brief's label/value tables have no header row, so count columns from the first row.
    const columns = table.columns.length || table.rows[0].length;
    const widths = columns === 2 ? [contentWidth * 0.38, contentWidth * 0.62] : Array.from({ length: columns }, () => contentWidth / columns);
    const row = (cells: string[], header: boolean) => {
      const font = header ? bold : regular, size = header ? 8.5 : 9.5;
      const wrapped = cells.map((cell, i) => wrap(cell, font, size, widths[i] - 12));
      const height = Math.max(...wrapped.map(lines => lines.length)) * size * 1.35 + 10;
      ensure(height);
      page.drawRectangle({ x: MARGIN, y: y - height, width: contentWidth, height, color: header ? SOFT : rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.75 });
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, n) => page.drawText(line, { x: x + 6, y: y - 5 - size - n * size * 1.35, size, font, color: header ? MUTED : INK }));
        x += widths[i];
      });
      y -= height;
    };
    if (header) row(table.columns, true);
    table.rows.forEach(cells => row(cells, false));
    y -= 16;
  };
  doc.tables.forEach(table => draw(table));

  // Page 2: the hosting brief, always on a page of its own.
  if (doc.brief) {
    newPage();
    text("BRIEF TAMU", { size: 9, font: bold, color: MUTED, gap: 2 });
    text(doc.title, { size: 20, font: bold, gap: 4 });
    text(doc.when, { size: 11, gap: 14 });
    doc.brief.forEach(group => draw({ title: group.title, columns: [], rows: group.rows, empty: "" }, false));
  }

  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    const left = pdfSafe([doc.banner || doc.title, `dibuat ${doc.generated}`].join(" · "));
    sheet.drawText(left, { x: MARGIN, y: 24, size: 8, font: regular, color: MUTED });
    const right = `Halaman ${index + 1} dari ${pages.length}`;
    sheet.drawText(right, { x: A4.width - MARGIN - regular.widthOfTextAtSize(right, 8), y: 24, size: 8, font: regular, color: MUTED });
  });
  return pdf.save();
}
