import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { sessionQrPdf } from "./qr-pdf";

describe("session QR sheet", () => {
  it("is one A5 page, also for long names and characters outside the PDF fonts", async () => {
    const bytes = await sessionQrPdf({ title: "Rekonsiliasi ACC dan penyelarasan data antar-departemen menuju WAM 2027 → final", startsAt: "2026-11-11T03:00:00Z", endsAt: "2026-11-11T05:00:00Z", planFrom: null, planTo: null, roomName: "CFC Ananta Room", location: "" }, "https://contoh.werkudara.com/pra-wam/absen/Abc_def-0123456789xyzQ");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(420);
    if (process.env.QR_PDF_OUT) writeFileSync(process.env.QR_PDF_OUT, bytes);
  });
});
