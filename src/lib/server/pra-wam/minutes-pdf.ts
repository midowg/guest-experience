import "server-only";
import { PDFDocument, PDFString, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { decisionLines, frmDate, frmDue, frmStamp, frmTime, guestNames, hasMinutesNumber, type MinutesMessage } from "@/lib/pra-wam/minutes-message";
import { pdfSafe } from "../beo-pdf";
import { FRM_LOGO_PNG_BASE64 } from "./frm-logo";

/*
 * A MoM as a PDF (12 Nov 2026): what goes to Telegram and what "Unduh PDF" gives. It is form
 * FRM.05.00.00.027 Minutes of Meeting as Word prints it, filled in: the form's head on every page
 * (logo, FORMULIR, MINUTES OF MEETING, No Dok, Tgl Efektif, Rev, Level), "Last Update/ Review",
 * and its sections in English in its order, bordered like the form: I Meeting Information, II
 * Attendance, III Agenda Items and Discussion, IV New Items/Topics (always, with the form's note),
 * V Action Items (Open/Done), VI Next Meeting, VII Attendance List (Sign: Present or Absent from
 * WAM). The meeting's photos follow as Documentation. The form's dates: "07 Aug. 26", "20-Nov-26".
 * Every page's foot names the MoM and its version, so a forwarded copy says which one it is.
 * Helvetica stands in for the form's Calibri, which may not be shipped with the app.
 */

const PAGE = { width: 595.28, height: 841.89 };
/** The form itself. */
const FORM = { number: "FRM.05.00.00.027", effective: "4-May-26", rev: "00", level: "4", review: "4-May-26" };
// Measured on the form as Word prints it, in points from the page's top left.
const BOX = { left: 36, right: 559.4, top: 28.3, bottom: 116.2, logo: 155.3, labels: 423.4, values: 474.7 };
const LOGO = { x: 68.6, y: 41.2, width: 54.5, height: 62.1 };
const LEFT = 50.2;
/** Where a page's content starts under the head, and where it must end above the foot. */
const TOP = 130, LIMIT = 800;
const FRAME = rgb(0.651, 0.651, 0.651), GRID = rgb(0.749, 0.749, 0.749), INK = rgb(0, 0, 0), NOTE = rgb(0.38, 0.38, 0.38);
const LINK = rgb(0.02, 0.39, 0.76), WARN = rgb(0.75, 0.1, 0.1);
const SIZE = 8.5;
/** A table's columns, as the form draws them. */
const COLUMNS = {
  info: [50.2, 152.7, 164.4, 560.4],
  attendance: [50.2, 99.6, 113.8, 560.4],
  agenda: [50.2, 70.5, 248.4, 404.4, 560.4],
  actions: [50.2, 71.2, 312.3, 390.2, 461.1, 560.4],
  next: [50.2, 170.5, 184.6, 560.4],
  list: [49.9, 68.2, 291.0, 389.8, 493.8, 558.7],
};

/** Wraps text to a width, keeping its own line breaks; a word longer than the width is broken. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (let word of pdfSafe(paragraph).split(" ")) {
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut -= 1;
        if (line) { out.push(line); line = ""; }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

type Run = { text: string; font: PDFFont };
/** A cell: its text, and optionally its font, or what to draw after its last line (x and baseline given). */
type Cell = string | { text: string; font?: PDFFont; after?: (x: number, baseline: number) => void };
type Spec = { columns: readonly number[]; head?: readonly string[]; headBold?: boolean; size?: number; minRow?: number; numbered?: boolean; bold?: number };

/** The MoM as a PDF; `photos` are the meeting's JPEGs, in order (one that cannot be read is left out). */
export async function minutesPdf(message: MinutesMessage, photos: readonly Uint8Array[] = []): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const mark = hasMinutesNumber(message) ? message.code : `MoM ${message.code}`;
  const version = Math.max(1, message.version);
  pdf.setTitle(pdfSafe(`${mark} ${message.title}`));
  pdf.setSubject(`Minutes of Meeting (${FORM.number}), version ${version}`);
  pdf.setLanguage("en");
  pdf.setProducer("WAM Werkudara");
  const [regular, bold, italic, boldItalic] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.HelveticaOblique), pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  const logo = await pdf.embedPng(Buffer.from(FRM_LOGO_PNG_BASE64, "base64"));
  const url = /^https?:\/\//.test(message.link) ? message.link : `https://${message.link}`;

  let page: PDFPage;
  let y = TOP;
  const at = (top: number) => PAGE.height - top;
  const write = (value: string, x: number, baseline: number, font: PDFFont, size: number, color: RGB = INK) =>
    page.drawText(value, { x, y: at(baseline), size, font, color });
  const line = (x1: number, y1: number, x2: number, y2: number, color: RGB = GRID, thickness = 0.5) =>
    page.drawLine({ start: { x: x1, y: at(y1) }, end: { x: x2, y: at(y2) }, thickness, color });

  /** The form's head: the same on every page. */
  function head() {
    const { left, right, top, bottom, logo: split, labels, values } = BOX;
    const middle = (top + bottom) / 2;
    for (const x of [left, split, labels, values, right]) line(x, top, x, bottom, FRAME, 0.96);
    line(left, top, right, top, FRAME, 0.96);
    line(left, bottom, right, bottom, FRAME, 0.96);
    line(split, middle, labels, middle, FRAME, 0.48);
    page.drawImage(logo, { x: LOGO.x, y: at(LOGO.y + LOGO.height), width: LOGO.width, height: LOGO.height });
    const centred = (value: string, font: PDFFont, size: number, baseline: number) =>
      write(value, split + (labels - split - font.widthOfTextAtSize(value, size)) / 2, baseline, font, size);
    centred("FORMULIR", bold, 17, (top + middle) / 2 + 6);
    centred("MINUTES OF MEETING", italic, 15, (middle + bottom) / 2 + 5.3);
    const rows: [string, string][] = [["No Dok", FORM.number], ["Tgl Efektif", FORM.effective], ["Rev", FORM.rev], ["Level", FORM.level]];
    const height = (bottom - top) / rows.length;
    rows.forEach(([label, value], index) => {
      const rowTop = top + height * index;
      if (index) line(labels, rowTop, right, rowTop, FRAME, 0.48);
      write(label, labels + 5.6, rowTop + height / 2 + 2.7, regular, 7.5);
      write(value, values + 5.3, rowTop + height / 2 + 2.7, bold, 7.5);
    });
  }
  function newPage() { page = pdf.addPage([PAGE.width, PAGE.height]); head(); y = TOP; }
  /** Starts a new page unless `height` still fits. */
  const room = (height: number) => { if (y + height > LIMIT) newPage(); };

  /** Words of several fonts wrapped as one paragraph; the first line starts at `first`. */
  function runs(parts: readonly Run[], size: number, first: number, x: number, right: number, baseline: number, leading: number, color: RGB): number {
    type Piece = { text: string; font: PDFFont };
    // Pieces that end with a space may end a line; the others stay with what follows.
    const words: Piece[][] = [[]];
    for (const part of parts) {
      for (const text of pdfSafe(part.text).split(/(?<= )/).filter(Boolean)) {
        words[words.length - 1].push({ text, font: part.font });
        if (text.endsWith(" ")) words.push([]);
      }
    }
    const width = (word: Piece[]) => word.reduce((sum, piece) => sum + piece.font.widthOfTextAtSize(piece.text, size), 0);
    let cursor = first;
    for (const word of words.filter(each => each.length)) {
      const trimmed = width(word) - (word[word.length - 1].text.endsWith(" ") ? word[word.length - 1].font.widthOfTextAtSize(" ", size) : 0);
      if (cursor + trimmed > right && cursor > x) { baseline += leading; cursor = x; }
      for (const piece of word) { write(piece.text, cursor, baseline, piece.font, size, color); cursor += piece.font.widthOfTextAtSize(piece.text, size); }
    }
    return baseline;
  }

  /** A section's heading as the form sets it: "III." then the title, and the form's note in italics. */
  function heading(number: string, title: string, note: readonly Run[] = [], keep = 60) {
    room(keep);
    y += 13;
    const baseline = y + 8;
    if (number) write(number, 44 - bold.widthOfTextAtSize(number, 10.5), baseline, bold, 10.5);
    write(title, LEFT, baseline, bold, 10.5);
    const end = note.length ? runs(note, 9.5, LEFT + bold.widthOfTextAtSize(`${title} `, 10.5), LEFT, COLUMNS.agenda[4], baseline, 15.5, NOTE) : baseline;
    y = end + 9;
  }

  /**
   * A bordered table like the form's. The head comes again on every page it runs onto; a row too
   * tall for what is left of the page goes on, line by line, on the next.
   */
  function table(spec: Spec, rows: readonly (readonly Cell[])[]) {
    const size = spec.size ?? SIZE;
    const leading = size + 2;
    const pad = 4.3;
    const edges = spec.columns;
    const widthOf = (index: number) => edges[index + 1] - edges[index] - 5;
    const cell = (value: Cell) => (typeof value === "string" ? { text: value } : value);
    const draw = (cells: readonly Cell[], fonts: (index: number) => PDFFont, minRow: number, isHead = false) => {
      const given = cells.map(cell);
      const lines = given.map((each, index) => wrap(each.text, each.font ?? fonts(index), size, widthOf(index)));
      const total = Math.max(1, ...lines.map(each => each.length));
      const fullPage = Math.floor((LIMIT - TOP - (spec.head ? 30 : 0) - pad) / leading);
      let start = 0;
      while (start < total) {
        const left = total - start;
        const fits = Math.floor((LIMIT - y - pad) / leading);
        const height = (count: number) => Math.max(count === total ? minRow : 0, count * leading + pad);
        if ((y + height(left) > LIMIT) && ((start === 0 && left <= fullPage) || fits < 2)) { newPage(); if (!isHead) drawHead(); continue; }
        const take = Math.min(left, fits);
        const rowHeight = height(take);
        const shift = (rowHeight - (take * leading + pad)) / 2;
        line(edges[0], y, edges[edges.length - 1], y);
        line(edges[0], y + rowHeight, edges[edges.length - 1], y + rowHeight);
        for (const x of edges) line(x, y, x, y + rowHeight);
        lines.forEach((each, index) => {
          const font = given[index].font ?? fonts(index);
          each.slice(start, start + take).forEach((text, row) => {
            const baseline = y + shift + 3 + size * 0.8 + row * leading;
            const x = spec.numbered && index === 0 ? edges[0] + (edges[1] - edges[0] - font.widthOfTextAtSize(text, size)) / 2 : edges[index] + 2.5;
            write(text, x, baseline, font, size);
            if (start + row === each.length - 1) given[index].after?.(x + font.widthOfTextAtSize(text, size), baseline);
          });
        });
        y += rowHeight;
        start += take;
      }
    };
    const drawHead = () => { if (spec.head) draw(spec.head, () => (spec.headBold ? bold : regular), spec.minRow ?? 0, true); };
    room((spec.head ? 30 : 0) + (spec.minRow ?? 15));
    drawHead();
    for (const cells of rows) draw(cells, index => (spec.bold === index ? bold : regular), spec.minRow ?? 0);
  }

  newPage();
  write(`Last Update/ Review: ${FORM.review}`, 36, 139, regular, SIZE);
  if (message.trial) {
    const sample = "TEST SAMPLE from WAM, not a real meeting";
    write(sample, BOX.right - bold.widthOfTextAtSize(sample, SIZE), 139, bold, SIZE, WARN);
  }
  y = 143;

  // I. Meeting information. The number links to the MoM in WAM.
  const numberCell: Cell = {
    text: message.code,
    after: (x, baseline) => {
      const start = x + 12;
      write("Can be checked ", start, baseline, regular, SIZE);
      const here = start + regular.widthOfTextAtSize("Can be checked ", SIZE);
      const width = regular.widthOfTextAtSize("here", SIZE);
      write("here", here, baseline, regular, SIZE, LINK);
      line(here, baseline + 1.2, here + width, baseline + 1.2, LINK, 0.5);
      const annotation = pdf.context.register(pdf.context.obj({
        Type: "Annot", Subtype: "Link", Rect: [here, at(baseline + 2), here + width, at(baseline - SIZE)], Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
      }));
      page.node.addAnnot(annotation);
    },
  };
  heading("I.", "MEETING INFORMATION");
  table({ columns: COLUMNS.info }, [
    ["MoM Number", ":", numberCell],
    ["Meeting Title", ":", message.title],
    ["Date", ":", frmDate(message.date)],
    ["Time Start", ":", message.from ? frmTime(message.from) : "-"],
    ["Time End", ":", message.to ? frmTime(message.to) : "-"],
    ["Location/Platform", ":", message.place || "-"],
    ["Chairperson", ":", message.chair || "-"],
    ["Minute Taker", ":", message.notetaker || "-"],
  ]);

  // II. Attendance: the names of who came (others who came too) and of who did not.
  const guests = guestNames(message.guests);
  const attendance = message.attendance;
  const present = attendance ? [...attendance.filter(person => person.present).map(person => person.name), ...guests] : [...message.participants];
  const absent = attendance ? attendance.filter(person => !person.present).map(person => person.name) : [];
  heading("II.", "ATTENDANCE");
  table({ columns: COLUMNS.attendance }, [["Present", ":", present.join(", ") || "-"], ["Absent", ":", absent.join(", ") || "-"]]);

  // III and IV. A MoM from before the form had a summary and decisions: they stand as one item.
  const items = message.items?.length ? message.items : [{ topic: message.title, discussion: message.summary, decision: message.decisions, added: false }];
  const itemRows = (list: typeof items) => list.map((item, index) => [`${index + 1}.`, item.topic, item.discussion || "-", decisionLines(item.decision).join("\n") || "-"]);
  const discussion = "Discussion Summary & Key Points";
  heading("III.", "AGENDA ITEMS AND DISCUSSION");
  table({ columns: COLUMNS.agenda, head: ["#", "Topic/Agenda Item", discussion, "Decisions/Outcomes"], numbered: true, bold: 1 }, itemRows(items.filter(item => !item.added)));
  heading("IV.", "NEW ITEMS/TOPICS", [
    { text: "(This section is reserved for the brief discussion of new subjects or issues that were ", font: italic },
    { text: "not formally listed on the agenda", font: boldItalic },
    { text: ". Decisions on these items should either be finalized quickly or deferred to a subsequent, planned meeting.)", font: italic },
  ], 100);
  const added = items.filter(item => item.added);
  table({ columns: COLUMNS.agenda, head: ["#", "Topic Raised", discussion, "Decisions/Outcomes"], numbered: true, bold: 1 },
    added.length ? itemRows(added) : [["", { text: "No new topics.", font: italic }, "", ""]]);

  // V. Action items.
  heading("V.", "ACTION ITEMS", [{ text: "(List all tasks that resulted from the meeting, who is responsible, and the deadline)", font: italic }], 80);
  table({ columns: COLUMNS.actions, head: ["#", "Action Item/Task", "PIC", "Due Date", "Status"], numbered: true },
    message.actions.length
      ? message.actions.map((action, index) => [`${index + 1}.`, action.task, action.pic || "-", action.dueDate ? frmDue(action.dueDate) : "-", action.done ? "Done" : "Open"])
      : [["", { text: "No action items.", font: italic }, "", "", ""]]);

  // VI. Next meeting.
  const next = message.next;
  heading("VI.", "NEXT MEETING");
  table({ columns: COLUMNS.next, size: 9.5 }, [
    ["Date", ":", next?.date ? frmDate(next.date) : "-"],
    ["Time", ":", next?.time ? frmTime(next.time) : "-"],
    ["Location/Platform", ":", next?.place.trim() || "-"],
    ["Draft Agenda Items", ":", next?.agenda.trim() || "-"],
  ]);

  // VII. Attendance list: Sign is Present or Absent from WAM; others who came are listed too.
  const listed: string[][] = attendance
    ? [...attendance.map(person => [person.name, person.department || "-", person.position || "-", person.present ? "Present" : "Absent"]), ...guests.map(name => [name, "-", "-", "Present"])]
    : message.participants.map(name => [name, "-", "-", "-"]);
  heading("VII.", "ATTENDANCE LIST", [], 90);
  table({ columns: COLUMNS.list, head: ["#", "Full Name", "Dept", "Position", "Sign"], headBold: true, numbered: true, minRow: 29.7 },
    listed.length ? listed.map((row, index) => [`${index + 1}.`, ...row]) : [["", "-", "", "", ""]]);

  // Documentation: the meeting's photos, two a row, each kept whole.
  const images: PDFImage[] = [];
  for (const bytes of photos) { try { images.push(await pdf.embedJpg(bytes)); } catch { /* not a JPEG pdf-lib reads: left out */ } }
  if (images.length) {
    heading("", "DOCUMENTATION", [], 200);
    const gap = 12;
    const right = COLUMNS.agenda[4];
    const cellWidth = (right - LEFT - gap) / 2;
    const MAX_HEIGHT = 230;
    for (let index = 0; index < images.length; index += 2) {
      const pair = images.slice(index, index + 2).map(image => {
        const scale = Math.min(cellWidth / image.width, MAX_HEIGHT / image.height);
        return { image, width: image.width * scale, height: image.height * scale };
      });
      const height = Math.max(...pair.map(each => each.height));
      room(height + 4);
      pair.forEach((each, column) => page.drawImage(each.image, {
        x: LEFT + column * (cellWidth + gap) + (cellWidth - each.width) / 2, y: at(y + each.height), width: each.width, height: each.height,
      }));
      y += height + gap;
    }
  }

  const by = message.version > 1 && message.changedBy ? ` by ${message.changedBy}` : "";
  const foot = pdfSafe(`${mark} · Version ${version} · ${message.version > 1 ? "updated" : "sent"} ${frmStamp(message.at)}${by} via WAM`);
  const count = pdf.getPageCount();
  for (const [index, each] of pdf.getPages().entries()) {
    page = each;
    write(foot, BOX.left, 822, regular, 7, NOTE);
    const number = `Page ${index + 1} of ${count}`;
    write(number, BOX.right - regular.widthOfTextAtSize(number, 7), 822, regular, 7, NOTE);
  }
  return pdf.save();
}
