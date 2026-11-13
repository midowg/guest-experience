import { describe, expect, it } from "vitest";
import {
  fileSizeLabel, isMeetingFileKey, looksLike, MOM_FILE_MAX, MOM_FILE_TYPES, momFileExt, momFileKeyFor, momFileName, momFileProblem, momFileStartSchema,
} from "./minutes-file";

const SESSION = "5e550000-0000-4000-8000-000000000001";
const ID = "11111111-1111-4111-8111-111111111111";

describe("MoM as a file", () => {
  it("takes PDF and Word by name, at most 10 MB", () => {
    expect([momFileExt("MoM.PDF"), momFileExt("notulen.docx"), momFileExt("lama.doc"), momFileExt("foto.jpg"), momFileExt("tanpa")]).toEqual(["pdf", "docx", "doc", null, null]);
    expect(momFileProblem({ name: "MoM.pdf", size: 1000 })).toBeNull();
    expect(momFileProblem({ name: "foto.jpg", size: 1000 })).toMatch(/PDF atau Word/);
    expect(momFileProblem({ name: "besar.pdf", size: MOM_FILE_MAX + 1 })).toMatch(/lebih dari 10 MB/);
    expect(momFileStartSchema.safeParse({ name: "a.docx", size: 10 }).success).toBe(true);
    expect(momFileStartSchema.safeParse({ name: "a.exe", size: 10 }).success).toBe(false);
    expect([fileSizeLabel(2_500_000), fileSizeLabel(820_000)]).toEqual(["2,4 MB", "801 KB"]);
  });

  it("keeps a safe name, and its key inside the meeting's folder", () => {
    expect(momFileName("MoM: rapat <SM>/final.docx")).toBe("MoM rapat SM final.docx");
    expect(momFileName("  .pdf")).toBe("MoM.pdf");
    const key = momFileKeyFor(SESSION, ID, "docx");
    expect(isMeetingFileKey(key, SESSION)).toBe(true);
    expect(isMeetingFileKey(key, "5e550000-0000-4000-8000-000000000002")).toBe(false);
    expect(isMeetingFileKey(`pra-wam/mom/${SESSION}/berkas/${ID}.exe`, SESSION)).toBe(false);
  });

  it("checks a file's first bytes against its kind", () => {
    expect(looksLike(MOM_FILE_TYPES.pdf, new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(looksLike(MOM_FILE_TYPES.docx, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(looksLike(MOM_FILE_TYPES.doc, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(true);
    expect(looksLike(MOM_FILE_TYPES.pdf, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
  });
});
