import { z } from "zod";

/*
 * Admin WAM → Main WAM → Modul acara (agen D): what an admin prepares before the event. Awarding:
 * categories (voted or judged), their window and announcement, the nominees (people, Momen photos,
 * or a kelompok/department by name). Silent Meeting: one question per session, its topics, and
 * whether it closes with the session. Pure: zod schemas the API and the forms share.
 * Computed categories ("otomatis", from Wellbeing points) are not offered: Wellbeing is not built.
 */

const iso = z.iso.datetime({ offset: true, message: "Tanggal dan jam belum lengkap." });
const optionalIso = iso.nullable().default(null);

export const ADMIN_METHODS = ["voting", "juri"] as const;
export const ADMIN_NOMINEE_KINDS = ["orang", "foto", "tim", "departemen"] as const;
export const nomineeKindLabels: Record<(typeof ADMIN_NOMINEE_KINDS)[number], string> = { orang: "Orang", foto: "Foto Momen", tim: "Kelompok", departemen: "Departemen" };

export const awardCategorySchema = z.object({
  title: z.string().trim().min(2, "Nama kategori minimal 2 huruf.").max(100, "Nama kategori paling banyak 100 karakter."),
  description: z.string().trim().max(300, "Pertanyaan paling banyak 300 karakter.").default(""),
  method: z.enum(ADMIN_METHODS, "Pilih voting karyawan atau juri BOD."),
  nomineeKind: z.enum(ADMIN_NOMINEE_KINDS, "Pilih jenis nominasi."),
  opensAt: optionalIso,
  closesAt: optionalIso,
  announceAt: optionalIso,
  sessionId: z.uuid("Sesi tidak dikenali.").nullable().default(null),
  sort: z.number().int().min(0).max(999).default(0),
  published: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.method === "voting" && value.published && (!value.opensAt || !value.closesAt)) {
    context.addIssue({ code: "custom", path: ["closesAt"], message: "Voting yang terbit perlu jam buka dan tutup." });
  }
  if (value.opensAt && value.closesAt && Date.parse(value.closesAt) <= Date.parse(value.opensAt)) {
    context.addIssue({ code: "custom", path: ["closesAt"], message: "Jam tutup harus setelah jam buka." });
  }
});
export type AwardCategoryInput = z.infer<typeof awardCategorySchema>;

/** The category's row for the database. */
export const categoryRow = (input: AwardCategoryInput) => ({
  title: input.title, description: input.description, method: input.method, nominee_kind: input.nomineeKind,
  opens_at: input.method === "voting" ? input.opensAt : null, closes_at: input.method === "voting" ? input.closesAt : null,
  announce_at: input.announceAt, session_id: input.sessionId, sort: input.sort, published: input.published, updated_at: new Date().toISOString(),
});

/** One nominee: exactly one of a person, a photo, or a name (kelompok, department). */
export const nomineeSchema = z.object({
  employeeId: z.uuid("Orang tidak dikenali.").nullable().default(null),
  photoId: z.uuid("Foto tidak dikenali.").nullable().default(null),
  label: z.string().trim().max(100, "Nama paling banyak 100 karakter.").default(""),
  reason: z.string().trim().max(300, "Alasan paling banyak 300 karakter.").default(""),
}).strict().refine(value => [value.employeeId, value.photoId, value.label || null].filter(Boolean).length === 1, { message: "Setiap nominasi berisi satu orang, satu foto, atau satu nama." });
/** PUT the whole list (the order is the list's order); at most 40. */
export const nomineesSchema = z.object({ nominees: z.array(nomineeSchema).max(40, "Paling banyak 40 nominasi.") }).strict()
  .refine(value => new Set(value.nominees.map(item => item.employeeId ?? item.photoId ?? item.label.toLowerCase())).size === value.nominees.length, { message: "Ada nominasi yang sama dua kali." });
export type NomineeInput = z.infer<typeof nomineeSchema>;

export const DEFAULT_TOPICS = ["Cara kerja", "Komunikasi", "Kesejahteraan", "Lainnya"];
export const silentQuestionSchema = z.object({
  sessionId: z.uuid("Pilih sesinya."),
  question: z.string().trim().min(5, "Pertanyaan minimal 5 huruf.").max(300, "Pertanyaan paling banyak 300 karakter."),
  topics: z.array(z.string().trim().min(1, "Topik tidak boleh kosong.").max(40, "Topik paling banyak 40 karakter.")).max(8, "Paling banyak 8 topik.").default(DEFAULT_TOPICS)
    .refine(list => new Set(list.map(topic => topic.toLowerCase())).size === list.length, "Ada topik yang sama dua kali."),
  autoClose: z.boolean().default(true),
}).strict();
export type SilentQuestionInput = z.infer<typeof silentQuestionSchema>;
