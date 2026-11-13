import "server-only";
import { decisionLines, frmDate, frmDue, frmStamp, frmTime, guestNames, hasMinutesNumber, type MinutesMessage } from "@/lib/pra-wam/minutes-message";
import { zipParts } from "../xlsx-write";
import { FRM_LOGO_PNG_BASE64 } from "./frm-logo";

/*
 * A MoM as a Word file (13 Nov 2026, Arsip MoM): the same form FRM.05.00.00.027 as the PDF, in the
 * same order and words, so the administration team can open it in Word and change it. The form's
 * head (logo, FORMULIR, MINUTES OF MEETING, No Dok, Tgl Efektif, Rev, Level) is the page header,
 * repeated on every page; each part is a real Word table and paragraph, Calibri as the form uses;
 * the foot names the MoM, its version and the page. The photos follow as Documentation, two a row.
 * A .docx is a zip of XML parts, so this needs nothing beyond Node.
 */

const FORM = { number: "FRM.05.00.00.027", effective: "4-May-26", rev: "00", level: "4", review: "4-May-26" };
/** Twips (1/20 pt): A4 and the form's margins (36 pt each side; the header box from 28.3 pt). */
const PAGE = { width: 11906, height: 16838, left: 720, right: 708, top: 2620, bottom: 1000, header: 566, footer: 420 };
const CONTENT = PAGE.width - PAGE.left - PAGE.right;
const EMU = 12700; // per point
const LINK = "0563C1";
const GRID = "BFBFBF";
const FRAME = "A6A6A6";

/** XML text: what XML 1.0 cannot hold goes, the rest escaped. */
const esc = (text: string) => text
  .replace(/[^\t\n\r\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type RunStyle = { bold?: boolean; italic?: boolean; size?: number; color?: string; underline?: boolean };
/** A run of text; its own line breaks become Word line breaks. */
function run(text: string, style: RunStyle = {}): string {
  const props = [
    style.bold ? "<w:b/>" : "", style.italic ? "<w:i/>" : "", style.color ? `<w:color w:val="${style.color}"/>` : "",
    style.underline ? `<w:u w:val="single"/>` : "", style.size ? `<w:sz w:val="${style.size * 2}"/><w:szCs w:val="${style.size * 2}"/>` : "",
  ].join("");
  // Line breaks and tabs as Word's own marks.
  const parts = text.split(/\r?\n/).map(line => line.split("\t").map(piece => `<w:t xml:space="preserve">${esc(piece)}</w:t>`).join("<w:tab/>"));
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${parts.join("<w:br/>")}</w:r>`;
}
type ParaStyle = { align?: "left" | "center" | "right"; before?: number; after?: number; keepNext?: boolean };
function para(runs: string, style: ParaStyle = {}): string {
  const props = [
    style.keepNext ? "<w:keepNext/>" : "",
    `<w:spacing w:before="${style.before ?? 0}" w:after="${style.after ?? 0}"/>`,
    style.align && style.align !== "left" ? `<w:jc w:val="${style.align}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

type Cell = string | { xml: string } | { text: string; style?: RunStyle };
const cellXml = (cell: Cell, style: RunStyle, keepNext = false) => typeof cell === "string" ? para(run(cell || " ", style), { keepNext })
  : "xml" in cell ? cell.xml : para(run(cell.text || " ", { ...style, ...cell.style }), { keepNext });
/** A bordered table; a head row repeats on every page; widths in twips. */
function table(widths: number[], rows: Cell[][], options: { head?: string[]; headBold?: boolean; boldColumn?: number; size?: number; borders?: boolean } = {}): string {
  const size = options.size ?? 10;
  const border = options.borders === false ? "nil" : "single";
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map(side => `<w:${side} w:val="${border}" w:sz="4" w:space="0" w:color="${GRID}"/>`).join("");
  const row = (cells: Cell[], head = false) => `<w:tr>${head ? "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells.map((cell, index) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/>${head ? `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` : ""}</w:tcPr>${cellXml(cell, { size, bold: (head && options.headBold !== false) || options.boldColumn === index }, head)}</w:tc>`).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblInd w:w="${280}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders>`
    + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`
    + `${options.head ? row(options.head, true) : ""}${rows.map(cells => row(cells)).join("")}</w:tbl>`;
}
/** "III.  AGENDA ITEMS AND DISCUSSION (note)". */
const heading = (number: string, title: string, note = "") => para(
  `${number ? run(`${number}\t`, { bold: true, size: 11 }) : ""}${run(title, { bold: true, size: 11 })}${note}`,
  { before: 220, after: 100, keepNext: true },
);

/** Points to twips across the content width, from the form's measured columns. */
const cols = (points: number[]) => {
  const total = points[points.length - 1] - points[0];
  const twips = points.slice(1).map((value, index) => Math.round(((value - points[index]) / total) * (CONTENT - 280)));
  return twips;
};
const COLUMNS = {
  info: cols([50.2, 152.7, 164.4, 560.4]),
  attendance: cols([50.2, 99.6, 113.8, 560.4]),
  agenda: cols([50.2, 70.5, 248.4, 404.4, 560.4]),
  actions: cols([50.2, 71.2, 312.3, 390.2, 461.1, 560.4]),
  next: cols([50.2, 170.5, 184.6, 560.4]),
  list: cols([49.9, 68.2, 291.0, 389.8, 493.8, 558.7]),
};

/** A JPEG's size in pixels, from its frame header; null when it cannot be read. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) { at += 1; continue; }
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // SOF0–SOF15, not DHT (C4), JPG (C8) or DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    at += 2 + length;
  }
  return null;
}

/** An image placed in its paragraph, sized in points. */
function picture(rel: string, id: number, name: string, width: number, height: number): string {
  const cx = Math.round(width * EMU), cy = Math.round(height * EMU);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

/** The form's head, as the page header: logo | FORMULIR / MINUTES OF MEETING | No Dok … Level. */
function headerXml(): string {
  const widths = [2400, 5650, 1030, 1400];
  const frame = ["top", "left", "bottom", "right", "insideH", "insideV"].map(side => `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="${FRAME}"/>`).join("");
  const cell = (width: number, content: string, extra = "") => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${extra}<w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`;
  const labels = [["No Dok", FORM.number], ["Tgl Efektif", FORM.effective], ["Rev", FORM.rev], ["Level", FORM.level]];
  const rows = labels.map(([label, value], index) => `<w:tr><w:trPr><w:trHeight w:val="440"/></w:trPr>${index === 0
    ? cell(widths[0], para(picture("rIdLogo", 1, "Logo", 54.5, 62.1), { align: "center" }), `<w:vMerge w:val="restart"/>`)
      + cell(widths[1], para(run("FORMULIR", { bold: true, size: 14 }), { align: "center" }), `<w:vMerge w:val="restart"/>`)
    : index === 2
      ? cell(widths[0], para(""), `<w:vMerge/>`) + cell(widths[1], para(run("MINUTES OF MEETING", { italic: true, size: 13 }), { align: "center" }), `<w:vMerge w:val="restart"/>`)
      : cell(widths[0], para(""), `<w:vMerge/>`) + cell(widths[1], para(""), `<w:vMerge/>`)}${cell(widths[2], para(run(label, { size: 7 })))}${cell(widths[3], para(run(value, { bold: true, size: 7 })))}</w:tr>`).join("");
  return `${XML}<w:hdr ${NS}><w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${frame}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>${para("")}</w:hdr>`;
}

/** The foot: which MoM, which version, sent when; the page number on the right. */
function footerXml(foot: string): string {
  const field = (code: string) => `<w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r>`
    + `<w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  return `${XML}<w:ftr ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${CONTENT}"/></w:tabs></w:pPr>${run(foot, { size: 7, color: "616161" })}`
    + `${run("\tPage ", { size: 7, color: "616161" })}${field("PAGE")}${run(" of ", { size: 7, color: "616161" })}${field("NUMPAGES")}</w:p></w:ftr>`;
}

/** A sent MoM as a .docx, with its photos (JPEG; one that cannot be read is left out). */
export function minutesDocx(message: MinutesMessage, photos: readonly Uint8Array[] = []): Uint8Array {
  const url = /^https?:\/\//.test(message.link) ? message.link : `https://${message.link}`;
  const mark = hasMinutesNumber(message) ? message.code : `MoM ${message.code}`;
  const version = Math.max(1, message.version);
  const body: string[] = [];

  body.push(para(run(`Last Update/ Review: ${FORM.review}`, { size: 9 }) + (message.trial ? run("\tTEST SAMPLE from WAM, not a real meeting", { bold: true, size: 9, color: "BF1A1A" }) : ""), { after: 60 }));

  // I. Meeting information. The number links to the MoM in WAM.
  const number = { xml: para(`${run(message.code, { size: 10 })}${run("    Can be checked ", { size: 10 })}<w:hyperlink r:id="rIdLink">${run("here", { size: 10, color: LINK, underline: true })}</w:hyperlink>`) };
  body.push(heading("I.", "MEETING INFORMATION"));
  body.push(table(COLUMNS.info, [
    ["MoM Number", ":", number],
    ["Meeting Title", ":", message.title],
    ["Date", ":", frmDate(message.date)],
    ["Time Start", ":", message.from ? frmTime(message.from) : "-"],
    ["Time End", ":", message.to ? frmTime(message.to) : "-"],
    ["Location/Platform", ":", message.place || "-"],
    ["Chairperson", ":", message.chair || "-"],
    ["Minute Taker", ":", message.notetaker || "-"],
  ]));

  // II. Attendance.
  const guests = guestNames(message.guests);
  const attendance = message.attendance;
  const present = attendance ? [...attendance.filter(person => person.present).map(person => person.name), ...guests] : [...message.participants];
  const absent = attendance ? attendance.filter(person => !person.present).map(person => person.name) : [];
  body.push(heading("II.", "ATTENDANCE"));
  body.push(table(COLUMNS.attendance, [["Present", ":", present.join(", ") || "-"], ["Absent", ":", absent.join(", ") || "-"]]));

  // III and IV.
  const items = message.items?.length ? message.items : [{ topic: message.title, discussion: message.summary, decision: message.decisions, added: false }];
  const itemRows = (list: typeof items): Cell[][] => list.map((item, index) => [`${index + 1}.`, item.topic, item.discussion || "-", decisionLines(item.decision).join("\n") || "-"]);
  const discussion = "Discussion Summary & Key Points";
  body.push(heading("III.", "AGENDA ITEMS AND DISCUSSION"));
  body.push(table(COLUMNS.agenda, itemRows(items.filter(item => !item.added)), { head: ["#", "Topic/Agenda Item", discussion, "Decisions/Outcomes"], headBold: false, boldColumn: 1 }));
  body.push(heading("IV.", "NEW ITEMS/TOPICS",
    run(" (This section is reserved for the brief discussion of new subjects or issues that were ", { italic: true, size: 10 })
    + run("not formally listed on the agenda", { italic: true, bold: true, size: 10 })
    + run(". Decisions on these items should either be finalized quickly or deferred to a subsequent, planned meeting.)", { italic: true, size: 10 })));
  const added = items.filter(item => item.added);
  body.push(table(COLUMNS.agenda, added.length ? itemRows(added) : [["", { text: "No new topics.", style: { italic: true } }, "", ""]],
    { head: ["#", "Topic Raised", discussion, "Decisions/Outcomes"], headBold: false, boldColumn: 1 }));

  // V. Action items.
  body.push(heading("V.", "ACTION ITEMS", run(" (List all tasks that resulted from the meeting, who is responsible, and the deadline)", { italic: true, size: 10 })));
  body.push(table(COLUMNS.actions, message.actions.length
    ? message.actions.map((action, index) => [`${index + 1}.`, action.task, action.pic || "-", action.dueDate ? frmDue(action.dueDate) : "-", action.done ? "Done" : "Open"])
    : [["", { text: "No action items.", style: { italic: true } }, "", "", ""]], { head: ["#", "Action Item/Task", "PIC", "Due Date", "Status"], headBold: false }));

  // VI. Next meeting.
  const next = message.next;
  body.push(heading("VI.", "NEXT MEETING"));
  body.push(table(COLUMNS.next, [
    ["Date", ":", next?.date ? frmDate(next.date) : "-"],
    ["Time", ":", next?.time ? frmTime(next.time) : "-"],
    ["Location/Platform", ":", next?.place.trim() || "-"],
    ["Draft Agenda Items", ":", next?.agenda.trim() || "-"],
  ]));

  // VII. Attendance list.
  const listed: Cell[][] = attendance
    ? [...attendance.map(person => [person.name, person.department || "-", person.position || "-", person.present ? "Present" : "Absent"]), ...guests.map(name => [name, "-", "-", "Present"])]
    : message.participants.map(name => [name, "-", "-", "-"]);
  body.push(heading("VII.", "ATTENDANCE LIST"));
  body.push(table(COLUMNS.list, listed.length ? listed.map((row, index) => [`${index + 1}.`, ...row]) : [["", "-", "", "", ""]],
    { head: ["#", "Full Name", "Dept", "Position", "Sign"] }));

  // Documentation: the photos, two a row.
  const media: { name: string; bytes: Uint8Array; rel: string; width: number; height: number }[] = [];
  for (const bytes of photos) {
    const size = jpegSize(bytes);
    if (size) media.push({ name: `foto${media.length + 1}.jpg`, bytes, rel: `rIdFoto${media.length + 1}`, ...size });
  }
  if (media.length) {
    body.push(heading("", "DOCUMENTATION"));
    const cellWidth = Math.floor((CONTENT - 280) / 2);
    const maxWidth = cellWidth / 20 - 12, maxHeight = 230;
    const rows: Cell[][] = [];
    for (let index = 0; index < media.length; index += 2) {
      rows.push(media.slice(index, index + 2).map((image, column) => {
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        return { xml: para(picture(image.rel, 10 + index + column, image.name, image.width * scale, image.height * scale), { align: "center", after: 120 }) };
      }));
      if (rows[rows.length - 1].length === 1) rows[rows.length - 1].push("");
    }
    body.push(table([cellWidth, cellWidth], rows, { borders: false }));
  }

  const by = message.version > 1 && message.changedBy ? ` by ${message.changedBy}` : "";
  const foot = `${mark} · Version ${version} · ${message.version > 1 ? "updated" : "sent"} ${frmStamp(message.at)}${by} via WAM`;
  const section = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>`
    + `<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="${PAGE.header}" w:footer="${PAGE.footer}" w:gutter="0"/></w:sectPr>`;
  const document = `${XML}<w:document ${NS}><w:body>${body.join("")}${section}</w:body></w:document>`;

  const styles = `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>`
    + `<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:tabs><w:tab w:val="left" w:pos="560"/></w:tabs><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const imageTypes = `<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>`;
  const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageTypes}`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    + `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
    + `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const documentRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="${REL}/footer" Target="footer1.xml"/>`
    + `<Relationship Id="rIdLink" Type="${REL}/hyperlink" Target="${esc(url)}" TargetMode="External"/>`
    + media.map(image => `<Relationship Id="${image.rel}" Type="${REL}/image" Target="media/${image.name}"/>`).join("") + `</Relationships>`;
  const headerRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="${REL}/image" Target="media/logo.png"/></Relationships>`;
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${esc(`Minutes of Meeting · ${message.title}`)}</dc:title><dc:creator>WAM Werkudara</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date(message.at).toISOString()}</dcterms:created></cp:coreProperties>`;

  const text = (value: string) => Buffer.from(value, "utf8");
  return new Uint8Array(zipParts([
    ["[Content_Types].xml", text(contentTypes)],
    ["_rels/.rels", text(rels)],
    ["docProps/core.xml", text(core)],
    ["word/document.xml", text(document)],
    ["word/styles.xml", text(styles)],
    ["word/header1.xml", text(headerXml())],
    ["word/footer1.xml", text(footerXml(foot))],
    ["word/_rels/document.xml.rels", text(documentRels)],
    ["word/_rels/header1.xml.rels", text(headerRels)],
    ["word/media/logo.png", Buffer.from(FRM_LOGO_PNG_BASE64, "base64")],
    ...media.map(image => [`word/media/${image.name}`, Buffer.from(image.bytes)] as [string, Buffer]),
  ]));
}
