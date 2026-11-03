import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { CHECK_IN_MARGIN_MINUTES } from "@/lib/pra-wam/attendance";
import { sessionWhen, sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { pdfSafe } from "../beo-pdf";

/*
 * The sheet panitia prints and puts at the door: one A5 page per session with its name, time,
 * place, the QR, and how to use it. The QR stays the same when the session moves, so the sheet
 * only needs printing again when panitia makes a new QR.
 */

const A5 = { width: 419.53, height: 595.28 };
const BLUE = rgb(0.082, 0.318, 0.627), BRASS = rgb(0.663, 0.506, 0.247), INK = rgb(0.18, 0.17, 0.17), MUTED = rgb(0.42, 0.4, 0.4);

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

export async function sessionQrPdf(session: Pick<Session, "title" | "startsAt" | "endsAt" | "planFrom" | "planTo" | "roomName" | "location">, url: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`QR absen - ${session.title}`));
  const page = pdf.addPage([A5.width, A5.height]);
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  const margin = 36, width = A5.width - margin * 2;
  const center = (text: string, font: PDFFont, size: number, y: number, color = INK) =>
    page.drawText(text, { x: (A5.width - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });

  page.drawRectangle({ x: 0, y: A5.height - 64, width: A5.width, height: 64, color: BLUE });
  center("PRA WAM  ·  ABSEN", bold, 12, A5.height - 30, rgb(1, 1, 1));
  center("Pindai untuk mencatat kehadiran", regular, 9, A5.height - 46, rgb(0.9, 0.86, 0.75));

  let y = A5.height - 100;
  for (const line of lines(session.title, bold, 20, width).slice(0, 3)) { center(line, bold, 20, y, BLUE); y -= 24; }
  center(pdfSafe(sessionWhen(session)), regular, 11, y - 2); y -= 18;
  center(pdfSafe(sessionWhere(session)), regular, 11, y - 2); y -= 18;

  const size = 230;
  const png = await pdf.embedPng(await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 1, width: 800 }));
  const qrY = y - 16 - size;
  page.drawRectangle({ x: (A5.width - size) / 2 - 10, y: qrY - 10, width: size + 20, height: size + 20, borderColor: BRASS, borderWidth: 1.5 });
  page.drawImage(png, { x: (A5.width - size) / 2, y: qrY, width: size, height: size });

  y = qrY - 36;
  const steps = [
    "1. Buka kamera ponsel dan arahkan ke QR, atau buka menu Absen di aplikasi Pra WAM.",
    "2. Masuk dengan akun Pra WAM bila diminta.",
    `3. Absen dibuka ${CHECK_IN_MARGIN_MINUTES} menit sebelum mulai sampai ${CHECK_IN_MARGIN_MINUTES} menit setelah selesai.`,
  ];
  for (const step of steps) for (const line of lines(step, regular, 9.5, width)) { page.drawText(line, { x: margin, y, size: 9.5, font: regular, color: INK }); y -= 13; }
  center(pdfSafe(url), regular, 7, 28, MUTED);
  return pdf.save();
}
