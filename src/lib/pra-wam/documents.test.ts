import { describe, expect, it } from "vitest";
import { documentStartSchema, matchesType, safeFilename, sizeLabel } from "./documents";

describe("documents", () => {
  it("checks the first bytes against the agreed type", () => {
    expect(matchesType("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(matchesType("application/pdf", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(matchesType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });
  it("makes a safe file name with the type's extension", () => {
    expect(safeFilename("Bahan HOD (final) v2.PDF", "application/pdf")).toBe("Bahan-HOD-final-v2.pdf");
    expect(safeFilename("../../rahasia.exe", "image/png")).toBe("rahasia.png");
    expect(safeFilename("???", "image/jpeg")).toBe("dokumen.jpg");
    expect(safeFilename("C:\\Users\\a\\Notulen.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Notulen.docx");
  });
  it("refuses other kinds and files over 25 MB", () => {
    const base = { title: "Bahan", filename: "a.pdf", mime: "application/pdf", size: 1000 };
    expect(documentStartSchema.safeParse(base).success).toBe(true);
    expect(documentStartSchema.safeParse({ ...base, mime: "application/zip" }).success).toBe(false);
    expect(documentStartSchema.safeParse({ ...base, size: 26 * 1024 * 1024 }).success).toBe(false);
  });
  it("labels sizes", () => {
    expect(sizeLabel(1_258_291)).toBe("1,2 MB");
    expect(sizeLabel(300)).toBe("1 KB");
  });
});
