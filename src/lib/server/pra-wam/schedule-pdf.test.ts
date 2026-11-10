import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { ExportDay } from "@/lib/pra-wam/schedule-export";
import { schedulePdf } from "./schedule-pdf";

describe("schedule PDF", () => {
  it("is A4, turns the page when the list is long, and draws characters outside the PDF fonts", async () => {
    const day = (date: string): ExportDay => ({ date, items: Array.from({ length: 14 }, (_, n) => ({
      title: `Appraisal team SM ${n + 1} → ✓`, place: "GMSM Room",
      slots: [{ start: "14.30", end: "16.00", pax: 1, booker: "SM - Raja" }, { start: "18.00", end: "19.30", pax: 2, booker: "SM - Raja" }],
    })) });
    const bytes = await schedulePdf([day("2026-11-10"), day("2026-11-11")], "9 – 15 Nov 2026", new Date("2026-11-10T04:50:00Z"));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(595);
    if (process.env.SCHEDULE_PDF_OUT) writeFileSync(process.env.SCHEDULE_PDF_OUT, bytes);
    expect((await schedulePdf([], "Selasa, 10 Nov 2026", new Date())).length).toBeGreaterThan(500);
  });
});
