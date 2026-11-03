import { z } from "zod";

/*
 * Documents in Pra WAM: meeting material for one session, or for everyone. The browser uploads
 * straight to private storage; the server agrees the type and size first and checks the file's
 * first bytes afterwards, so a renamed file of another kind is refused.
 */

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const documentTypes = {
  "application/pdf": { label: "PDF", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "Word", ext: "docx", magic: [0x50, 0x4b, 0x03, 0x04] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { label: "Excel", ext: "xlsx", magic: [0x50, 0x4b, 0x03, 0x04] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { label: "PowerPoint", ext: "pptx", magic: [0x50, 0x4b, 0x03, 0x04] },
  "image/jpeg": { label: "JPG", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { label: "PNG", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
} as const;
export type DocumentMime = keyof typeof documentTypes;
export const documentMimes = Object.keys(documentTypes) as DocumentMime[];
export const acceptDocuments = [...documentMimes, ...Object.values(documentTypes).map(type => `.${type.ext}`)].join(",");

/** Whether the first bytes match the agreed type. */
export const matchesType = (mime: DocumentMime, start: Uint8Array) => documentTypes[mime].magic.every((byte, index) => start[index] === byte);

/** A file name safe for a storage key and a download header, keeping its extension. */
export function safeFilename(name: string, mime: DocumentMime): string {
  const ext = documentTypes[mime].ext;
  const base = name.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "dokumen";
  return `${base}.${ext}`;
}

export const documentStartSchema = z.object({
  title: z.string().trim().min(2, "Isi judul dokumen.").max(150),
  sessionId: z.union([z.literal(""), z.uuid()]).default(""),
  filename: z.string().trim().min(1).max(200),
  mime: z.enum(documentMimes as [DocumentMime, ...DocumentMime[]], { message: "Jenis berkas: PDF, Word, Excel, PowerPoint, JPG, atau PNG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_DOCUMENT_BYTES, "Berkas lebih dari 25 MB."),
});
export type DocumentStart = z.infer<typeof documentStartSchema>;
export const documentFinishSchema = documentStartSchema.extend({ key: z.string().startsWith("pra-wam/dokumen/").max(300), token: z.string().regex(/^[0-9a-f]{64}$/) });

export type PraWamDocument = {
  id: string; title: string; filename: string; mime: string; size: number; createdAt: string;
  sessionId: string | null; sessionTitle: string | null; uploadedBy: string; canDelete: boolean;
};

/** "1,2 MB" */
export const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
