import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { decisionLines, dueDate, isMinutesNumber, longDate, stamp, type MinutesMessage } from "@/lib/pra-wam/minutes-message";
import { pdfSafe } from "../beo-pdf";

/*
 * A MoM as a PDF (12 Nov 2026): what goes to Telegram and what "Unduh PDF" gives. A4, in the order
 * of the paper form FRM.05.00.00.027: the number and meeting; when, where, the chairperson and the
 * notetaker; who came and who did not; the agenda items (topic, discussion, decision) and the new
 * topics; the follow-ups (task, PIC, due, Open/Done); the next meeting; the attendance list with
 * department and position; and the meeting's photos. A MoM from before the form shows its summary
 * and decisions instead of agenda items. The number and version stand in every page's foot, so a
 * forwarded copy says which MoM and which version it is.
 */

const A4 = { width: 595.28, height: 841.89 };
const BLUE = rgb(0.082, 0.318, 0.627), INK = rgb(0.18, 0.17, 0.17), MUTED = rgb(0.42, 0.4, 0.4), LINE = rgb(0.86, 0.85, 0.83), WARN = rgb(0.65, 0.2, 0.1);
const MARGIN = 48, WIDTH = A4.width - MARGIN * 2, BOTTOM = MARGIN + 24, GAP = 8, LABEL = 120;

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

type Column = { label: string; width: number };

/** The MoM as a PDF; `photos` are the meeting's JPEGs, in order (one that cannot be read is left out). */
export async function minutesPdf(message: MinutesMessage, photos: readonly Uint8Array[] = []): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const mark = isMinutesNumber(message.code) ? message.code : `MoM ${message.code}`;
  pdf.setTitle(pdfSafe(`${mark} ${message.title}`));
  pdf.setSubject(pdfSafe(`Notulen meeting, versi ${Math.max(1, message.version)}`));
  pdf.setProducer("WAM Werkudara");
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const newPage = () => { page = pdf.addPage([A4.width, A4.height]); y = A4.height - MARGIN; };
  const room = (height: number) => { if (y - height < BOTTOM) newPage(); };
  const text = (value: string, font: PDFFont, size: number, color = INK, x = MARGIN) => page.drawText(value, { x, y, size, font, color });
  const paragraph = (value: string, font: PDFFont, size: number, color = INK, x = MARGIN, width = WIDTH) => {
    for (const line of wrap(value, font, size, width)) { room(size + 4); text(line, font, size, color, x); y -= size + 4; }
  };
  const rule = (at = y) => { page.drawLine({ start: { x: MARGIN, y: at }, end: { x: A4.width - MARGIN, y: at }, thickness: 0.75, color: LINE }); };
  const heading = (value: string) => { y -= 10; room(48); text(pdfSafe(value), bold, 12, BLUE); y -= 8; rule(); y -= 16; };
  /** Label and value rows: the value wraps beside its label. */
  const facts = (rows: readonly [string, string][]) => {
    for (const [label, value] of rows) {
      const lines = wrap(value || "-", regular, 10, WIDTH - LABEL);
      room(Math.min(lines.length, 3) * 14 + 2);
      text(pdfSafe(label), bold, 10, MUTED);
      for (const line of lines) { room(14); text(line, regular, 10, INK, MARGIN + LABEL); y -= 14; }
      y -= 2;
    }
  };
  /**
   * A table: its head again on every page it runs onto, and a row taller than what is left of the
   * page goes on line by line. `strong` marks a cell bold.
   */
  const table = (columns: readonly Column[], rows: readonly string[][], strong: (row: number, column: number) => boolean = () => false) => {
    const xs = columns.map((_, index) => MARGIN + columns.slice(0, index).reduce((sum, column) => sum + column.width + GAP, 0));
    const head = () => { for (const [index, column] of columns.entries()) text(pdfSafe(column.label), bold, 9, MUTED, xs[index]); y -= 14; };
    room(18 + 19);
    head();
    rows.forEach((cells, row) => {
      const wrapped = cells.map((cell, index) => wrap(cell || "-", regular, 9.5, columns[index].width));
      const lines = Math.max(...wrapped.map(each => each.length));
      if (y - Math.min(lines, 4) * 13 - 6 < BOTTOM) { newPage(); head(); }
      rule(y + 11);
      for (let line = 0; line < lines; line += 1) {
        if (y - 13 < BOTTOM) { newPage(); head(); }
        wrapped.forEach((each, index) => { if (each[line] !== undefined) text(each[line], strong(row, index) ? bold : regular, 9.5, INK, xs[index]); });
        y -= 13;
      }
      y -= 6;
    });
  };

  text("MINUTES OF MEETING (NOTULEN RAPAT)", bold, 10, MUTED); y -= 22;
  paragraph(message.title, bold, 18, BLUE);
  text(pdfSafe(`${isMinutesNumber(message.code) ? "No." : "Kode"} ${message.code} · Versi ${Math.max(1, message.version)}`), regular, 10, MUTED); y -= 16;
  if (message.trial) { text("UJI COBA dari WAM, bukan meeting sungguhan.", bold, 10, WARN); y -= 16; }
  y -= 6;

  const frm = !!message.items?.length || !!message.attendance;
  facts([
    ["Departemen", message.department],
    ["Hari, tanggal", longDate(message.date)],
    ["Waktu", message.from && message.to ? `${message.from}–${message.to} WIB` : "-"],
    ["Tempat", message.place || "-"],
    ...(frm ? [["Pimpinan rapat", message.chair ?? "-"] as [string, string]] : []),
    ["Notulis", message.notetaker ?? "-"],
  ]);

  // Who came: present and absent of the people in it, and the others; before the form, who was in it.
  if (message.attendance) {
    heading("Kehadiran");
    const present = message.attendance.filter(person => person.present).map(person => person.name);
    const absent = message.attendance.filter(person => !person.present).map(person => person.name);
    facts([
      [`Hadir (${present.length})`, present.join(", ")],
      [`Tidak hadir (${absent.length})`, absent.join(", ")],
      ...(message.guests?.trim() ? [["Peserta lain", message.guests.trim()] as [string, string]] : []),
    ]);
  } else {
    facts([[`Peserta (${message.participants.length})`, message.participants.join(", ")]]);
  }

  const items = message.items ?? [];
  if (items.length) {
    const columns: Column[] = [{ label: "No", width: 18 }, { label: "Topik", width: 110 }, { label: "Pembahasan & poin penting", width: 205 }, { label: "Keputusan", width: WIDTH - 18 - 110 - 205 - GAP * 3 }];
    const rows = (list: typeof items) => list.map((item, index) => [String(index + 1), item.topic, item.discussion, decisionLines(item.decision).join("\n")]);
    const agenda = items.filter(item => !item.added);
    const added = items.filter(item => item.added);
    if (agenda.length) { heading("Agenda dan pembahasan"); table(columns, rows(agenda), (_, column) => column === 1); }
    if (added.length) { heading("Topik baru (di luar agenda)"); table(columns, rows(added), (_, column) => column === 1); }
  } else {
    if (message.summary.trim()) { heading("Ringkasan"); paragraph(message.summary.trim(), regular, 10.5); }
    const decisions = decisionLines(message.decisions);
    if (decisions.length) {
      heading("Keputusan");
      for (const line of decisions) { paragraph(line, regular, 10.5); y -= 2; }
    }
  }

  if (message.actions.length) {
    heading("Tindak lanjut");
    table([{ label: "No", width: 18 }, { label: "Tugas", width: 230 }, { label: "PIC", width: 110 }, { label: "Tenggat", width: 66 }, { label: "Status", width: WIDTH - 18 - 230 - 110 - 66 - GAP * 4 }],
      message.actions.map((action, index) => [String(index + 1), action.task, action.pic ?? "-", action.dueDate ? dueDate(action.dueDate) : "-", action.done ? "Done" : "Open"]),
      (row, column) => column === 4 && !message.actions[row].done);
  }

  const next = message.next;
  if (next && (next.date || next.time || next.place.trim() || next.agenda.trim())) {
    heading("Meeting berikutnya");
    facts([
      ["Hari, tanggal", next.date ? longDate(next.date) : "-"],
      ["Waktu", next.time ? `${next.time.replace(":", ".")} WIB` : "-"],
      ["Tempat", next.place.trim() || "-"],
      ["Rancangan agenda", next.agenda.trim() || "-"],
    ]);
  }

  if (message.attendance?.length) {
    heading("Daftar hadir");
    table([{ label: "No", width: 18 }, { label: "Nama lengkap", width: 150 }, { label: "Departemen", width: 120 }, { label: "Jabatan", width: 125 }, { label: "Kehadiran", width: WIDTH - 18 - 150 - 120 - 125 - GAP * 4 }],
      message.attendance.map((person, index) => [String(index + 1), person.name, person.department, person.position, person.present ? "Hadir" : "Tidak hadir"]),
      (row, column) => column === 4 && !message.attendance![row].present);
  }

  // Dokumentasi: two photos a row, each kept whole.
  const images: PDFImage[] = [];
  for (const bytes of photos) { try { images.push(await pdf.embedJpg(bytes)); } catch { /* not a JPEG pdf-lib reads: left out */ } }
  if (images.length) {
    heading("Dokumentasi");
    const cell = (WIDTH - GAP * 2) / 2;
    const MAX_HEIGHT = 250;
    for (let index = 0; index < images.length; index += 2) {
      const pair = images.slice(index, index + 2).map(image => {
        const scale = Math.min(cell / image.width, MAX_HEIGHT / image.height);
        return { image, width: image.width * scale, height: image.height * scale };
      });
      const height = Math.max(...pair.map(each => each.height));
      room(height + GAP);
      pair.forEach((each, at) => page.drawImage(each.image, { x: MARGIN + at * (cell + GAP * 2) + (cell - each.width) / 2, y: y - each.height, width: each.width, height: each.height }));
      y -= height + GAP * 2;
    }
  }

  const foot = pdfSafe(`${mark} · Versi ${Math.max(1, message.version)} · ${message.version > 1 ? "diperbarui" : "dikirim"} ${stamp(message.at)} lewat WAM`);
  for (const [index, each] of pdf.getPages().entries()) {
    each.drawText(foot, { x: MARGIN, y: 28, size: 8, font: regular, color: MUTED });
    const number = `${index + 1}/${pdf.getPageCount()}`;
    each.drawText(number, { x: A4.width - MARGIN - regular.widthOfTextAtSize(number, 8), y: 28, size: 8, font: regular, color: MUTED });
  }
  return pdf.save();
}
