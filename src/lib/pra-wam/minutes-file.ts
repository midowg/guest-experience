import { z } from "zod";

/*
 * MoM sebagai berkas (13 Nov 2026, migration 202611130004): the MoM uploaded as one file, PDF or
 * Word, instead of the form. One per meeting; with Kirim MoM it is the MoM. Pure, so it is tested
 * without a server.
 */

export const MOM_FILE_MIGRATION = "202611130004_pw_minute_files.sql";
/** At most 10 MB. */
export const MOM_FILE_MAX = 10 * 1024 * 1024;
export const MOM_FILE_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type MomFileExt = keyof typeof MOM_FILE_TYPES;
export type MomFileType = (typeof MOM_FILE_TYPES)[MomFileExt];
/** What the file picker offers. */
export const momFileAccept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A meeting's MoM file, as Detail sesi and Arsip MoM show it. */
export type MinuteFile = { name: string; size: number; type: MomFileType; uploadedBy: string | null; uploadedAt: string; url: string; canDelete: boolean };

/** The kind of a file, by its name (a phone may give no type): pdf, doc, docx, or null. */
export function momFileExt(name: string): MomFileExt | null {
  const ext = name.trim().toLowerCase().match(/\.([a-z]+)$/)?.[1];
  return ext && ext in MOM_FILE_TYPES ? (ext as MomFileExt) : null;
}
export const momFileExtOfType = (type: string): MomFileExt | null =>
  (Object.entries(MOM_FILE_TYPES).find(([, mime]) => mime === type)?.[0] as MomFileExt | undefined) ?? null;
/** "PDF", "Word". */
export const momFileKind = (type: string) => (type === MOM_FILE_TYPES.pdf ? "PDF" : "Word");
/** "2,4 MB", "820 KB". */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
/** Why a picked file cannot be the MoM, or null. */
export function momFileProblem(file: { name: string; size: number }): string | null {
  if (!momFileExt(file.name)) return "Pilih berkas PDF atau Word (.pdf, .doc, .docx).";
  if (file.size > MOM_FILE_MAX) return `Berkas lebih dari ${fileSizeLabel(MOM_FILE_MAX)}. Kecilkan dulu, misalnya simpan ulang sebagai PDF.`;
  if (file.size < 1) return "Berkas kosong. Pilih berkas lain.";
  return null;
}

/** The name kept: no folders or odd characters, the kind's extension, at most 120 characters. */
export function momFileName(name: string): string {
  const ext = momFileExt(name) ?? "pdf";
  const base = name.replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110) || "MoM";
  return `${base}.${ext}`;
}

/** Where a meeting's file is kept in storage. */
export const momFileKeyFor = (sessionId: string, id: string, ext: MomFileExt) => `pra-wam/mom/${sessionId}/berkas/${id}.${ext}`;
const keyPattern = /^pra-wam\/mom\/[0-9a-f-]{36}\/berkas\/[0-9a-f-]{36}\.(pdf|docx?)$/;
/** The key is a file of this meeting: nobody confirms into another meeting's folder. */
export const isMeetingFileKey = (key: string, sessionId: string) => keyPattern.test(key) && key.startsWith(`pra-wam/mom/${sessionId}/berkas/`);

/** The file's first bytes are its kind: %PDF, a Word zip (DOCX), or an old Word file (DOC). */
export function looksLike(type: MomFileType, start: Uint8Array): boolean {
  const at = (bytes: number[]) => bytes.every((byte, index) => start[index] === byte);
  if (type === MOM_FILE_TYPES.pdf) return at([0x25, 0x50, 0x44, 0x46]);
  if (type === MOM_FILE_TYPES.docx) return at([0x50, 0x4b, 0x03, 0x04]);
  return at([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

export const momFileStartSchema = z.object({
  name: z.string().trim().min(1, "Nama berkas kosong.").max(255),
  size: z.number().int().min(1).max(MOM_FILE_MAX, `Berkas paling besar ${fileSizeLabel(MOM_FILE_MAX)}.`),
}).refine(input => !!momFileExt(input.name), { path: ["name"], message: "Pilih berkas PDF atau Word (.pdf, .doc, .docx)." });
export type MomFileStart = z.infer<typeof momFileStartSchema>;
export const momFileConfirmSchema = z.object({
  name: z.string().trim().min(1).max(255), size: z.number().int().min(1).max(MOM_FILE_MAX),
  key: z.string().max(300), token: z.string().max(200),
});
