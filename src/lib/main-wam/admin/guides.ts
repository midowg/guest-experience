import { z } from "zod";
import { GUIDE_KINDS, type MwGuide } from "../types";
import { fold } from "./tsv";

/*
 * Admin WAM → Main WAM → Panduan (agen E): Denah, Hotel & fasilitas, Dress code, Tata tertib, and
 * anything else: a title, short text, an optional image or PDF in private storage (R2 key
 * main-wam/panduan/<uuid>.<ext>, the migration checks the shape), an order, and published or not.
 * The file goes up in two steps like the KV images (the server names the key and signs the size,
 * then checks the first bytes). Pure: shared by the page and the server.
 */

export const GUIDE_FILE_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" } as const;
export type GuideFileMime = keyof typeof GUIDE_FILE_TYPES;
/** 25 MB, the migration's limit: a venue map as PDF fits well under it. */
export const GUIDE_FILE_BYTES = 25 * 1024 * 1024;

export const guideInputSchema = z.object({
  kind: z.enum(GUIDE_KINDS, { message: "Jenis panduan tidak dikenal." }),
  title: z.string().trim().min(2, "Tulis judul panduan.").max(100, "Judul paling panjang 100 karakter."),
  body: z.string().max(8000, "Isi paling panjang 8.000 karakter.").transform(value => value.replace(/\r\n/g, "\n").trim()),
  sort: z.number().int().min(0).max(10_000),
  published: z.boolean(),
});
export type GuideInput = z.infer<typeof guideInputSchema>;

/** PUT a guide: its fields, and `removeFile` to drop its file. */
export const guideUpdateSchema = guideInputSchema.extend({ removeFile: z.boolean().optional() });

export const guideFileStartSchema = z.object({
  guideId: z.uuid({ message: "Panduan tidak dikenali." }),
  mime: z.enum(Object.keys(GUIDE_FILE_TYPES) as [GuideFileMime, ...GuideFileMime[]], { message: "Pilih gambar (WebP, JPG, PNG) atau PDF." }),
  size: z.number().int().min(1, "Berkas kosong.").max(GUIDE_FILE_BYTES, "Berkas lebih dari 25 MB."),
});
export type GuideFileStart = z.infer<typeof guideFileStartSchema>;
export const guideFileConfirmSchema = guideFileStartSchema.extend({
  key: z.string().min(1).max(200),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});

export const guideFileKey = (id: string, mime: GuideFileMime) => `main-wam/panduan/${id}.${GUIDE_FILE_TYPES[mime]}`;
export const isGuideFileKey = (key: string) => /^main-wam\/panduan\/[0-9a-f-]{36}\.(webp|jpg|png|pdf)$/.test(key);

/** The address of a guide in the app (/wam/acara/saya/panduan/<slug>): from its title, unique among the others. */
export function guideSlug(title: string, taken: readonly string[]): string {
  const base = fold(title).replace(/&/g, " dan ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34).replace(/-+$/, "") || "panduan";
  const padded = base.length < 3 ? `${base}-panduan`.slice(0, 34) : base;
  const used = new Set(taken);
  if (!used.has(padded)) return padded;
  for (let n = 2; n < 1000; n++) if (!used.has(`${padded}-${n}`)) return `${padded}-${n}`;
  return `${padded}-${Date.now() % 100000}`;
}

/** "PDF · 1,1 MB", "Gambar · 640 KB". */
export function fileLabel(file: NonNullable<MwGuide["file"]>): string {
  const size = file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${file.mime === "application/pdf" ? "PDF" : "Gambar"} · ${size}`;
}

/** The four guides the handbook expects (ANALISA_FITUR_16NOV: Denah, Hotel & fasilitas, Dress code, Tata tertib). */
export const STARTER_GUIDES: { kind: MwGuide["kind"]; title: string }[] = [
  { kind: "denah", title: "Denah venue" },
  { kind: "hotel", title: "Hotel & fasilitas" },
  { kind: "dresscode", title: "Dress code per hari" },
  { kind: "tata_tertib", title: "Tata tertib kegiatan" },
];
