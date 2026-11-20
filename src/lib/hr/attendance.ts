import { z } from "zod";
import { EMBEDDING_SIZE, type FaceVerdict } from "./face-match";
import { LIVENESS } from "./liveness";
import { photoTypes, type PhotoMime } from "@/lib/pra-wam/photo";
import { VIEWER_ZONES, zoneDate, type ViewerZone } from "@/lib/pra-wam/zone";

/*
 * Absen harian kantor (decided 20 Nov 2026, migration 202611200701). Every active employee clocks
 * in (masuk) and out (pulang) once a day with their face and their location:
 *   - the face is followed on the phone (two random liveness steps) and turned into an embedding;
 *     the server scores it against the person's reference, which never leaves the server;
 *   - the location is inside an office point's radius (HR → Kelola → Titik kantor), or outside with a
 *     reason (event, dinas, WFH, lainnya), which Admin HR then checks;
 *   - a small selfie is kept as proof for 90 days.
 * Only the times are recorded for now (no "terlambat" yet). Pure rules, shared by screens and server.
 */

export const DAILY_MIGRATION = "202611200701_pw_absen_harian.sql";

export const DAILY_KINDS = ["masuk", "pulang"] as const;
export type DailyKind = (typeof DAILY_KINDS)[number];
export const kindLabels: Record<DailyKind, string> = { masuk: "Masuk", pulang: "Pulang" };

export const DAILY_STATUSES = ["sah", "perlu_cek", "ditolak"] as const;
export type DailyStatus = (typeof DAILY_STATUSES)[number];
export const statusLabels: Record<DailyStatus, string> = { sah: "Sah", perlu_cek: "Perlu dicek", ditolak: "Ditolak" };

export const REASON_KINDS = ["event", "dinas", "wfh", "lainnya"] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];
export const reasonLabels: Record<ReasonKind, string> = { event: "Event / venue", dinas: "Dinas luar", wfh: "WFH", lainnya: "Lainnya" };

export const FACE_STATUSES = ["impor", "siap", "aktif", "menunggu", "ditolak"] as const;
export type FaceStatus = (typeof FACE_STATUSES)[number];
export const faceStatusLabels: Record<FaceStatus, string> = {
  impor: "Foto impor, belum diproses",
  siap: "Siap, menunggu persetujuan karyawan",
  aktif: "Aktif",
  menunggu: "Menunggu persetujuan Admin HR",
  ditolak: "Perlu daftar ulang",
};
export type FaceSource = "greatday" | "daftar";
/** A reference that can be compared with: the person's own (aktif or waiting for an admin), or one imported that they agree to now. */
export const usableFace = (status: FaceStatus | null) => status === "aktif" || status === "menunggu" || status === "siap";

/** Why the server marked a clock-in "perlu_cek"; shown to the admin. */
export const DAILY_FLAGS = ["di_luar_area", "gps_tidak_akurat", "tanpa_titik_kantor", "skor_rendah", "wajah_belum_disetujui", "lokasi_melompat", "belum_absen_masuk"] as const;
export type DailyFlag = (typeof DAILY_FLAGS)[number];
export const flagLabels: Record<DailyFlag, string> = {
  di_luar_area: "Di luar area kantor",
  gps_tidak_akurat: "Lokasi kurang akurat",
  tanpa_titik_kantor: "Belum ada titik kantor",
  skor_rendah: "Skor wajah rendah",
  wajah_belum_disetujui: "Wajah belum disetujui Admin HR",
  lokasi_melompat: "Lokasi melompat dari absen sebelumnya",
  belum_absen_masuk: "Pulang tanpa absen masuk",
};

/**
 * The consent the person gives before their face is used (UU PDP: face data is specific personal
 * data). A new version asks everyone again. To be read by HR/legal before it opens to everyone.
 */
export const CONSENT_VERSION = "2026-11-20";
export const consentPoints = [
  "Untuk absensi, HR Werkudara memakai wajahmu (foto acuan dan selfie setiap absen) dan lokasi HP-mu saat absen.",
  "Wajahmu dicocokkan di HP-mu sendiri; server hanya menyimpan angka ciri wajah (bukan untuk tujuan lain) dan foto acuan.",
  "Selfie setiap absen disimpan sebagai bukti. Admin HR menghapus selfie yang sudah lebih dari 90 hari. Hanya Admin HR yang bisa melihatnya.",
  "Foto acuan awal diambil dari foto dasar absen GreatDay HR; kamu bisa menggantinya dengan daftar ulang.",
  "Kamu bisa menarik persetujuan kapan saja di HR Werkudara → Data wajah. Data wajahmu dihapus, dan absenmu dicatat Admin HR secara manual.",
] as const;

/** How long a clock-in's challenge may be answered. */
export const CHALLENGE_SECONDS = 3 * 60;
/** Selfies (and their embeddings) older than this are deleted when Admin HR presses "Hapus selfie lama" (no schedule). */
export const SELFIE_KEEP_DAYS = 90;

/** The selfie: small, square, enough for an admin to recognise the person. */
export const SELFIE_SIDE = 480;
export const MAX_SELFIE_BYTES = 120 * 1024;
const selfieMimes = Object.keys(photoTypes) as [PhotoMime, ...PhotoMime[]];

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const selfieKeyPattern = new RegExp(`^pra-wam/absen-harian/${uuid}/${uuid}\\.(webp|jpg)$`);
export const selfieKeyFor = (employeeId: string, id: string, mime: PhotoMime) => `pra-wam/absen-harian/${employeeId}/${id}.${photoTypes[mime].ext}`;
export const isOwnSelfieKey = (key: string, employeeId: string, mime: PhotoMime) =>
  selfieKeyPattern.test(key) && key.startsWith(`pra-wam/absen-harian/${employeeId}/`) && key.endsWith(`.${photoTypes[mime].ext}`);

export const faceKeyPattern = new RegExp(`^pra-wam/wajah/${uuid}/${uuid}\\.(webp|jpg)$`);
export const faceKeyFor = (employeeId: string, id: string, mime: PhotoMime) => `pra-wam/wajah/${employeeId}/${id}.${photoTypes[mime].ext}`;
export const isOwnFaceKey = (key: string, employeeId: string, mime: PhotoMime) =>
  faceKeyPattern.test(key) && key.startsWith(`pra-wam/wajah/${employeeId}/`) && key.endsWith(`.${photoTypes[mime].ext}`);

/**
 * The work day of a clock-in: the date in the office's zone when inside an office point, else in the
 * person's own zone (someone at a venue in Bali clocks in on Bali's date).
 */
export const workDate = (at: string, zone: ViewerZone) => zoneDate(at, zone);

/**
 * Sah or perlu_cek, and why. A face below `perluCek` is never recorded (the phone asks again), so
 * it is not a case here.
 */
export function dailyStatus(input: {
  inside: boolean;
  outsideWhy?: "jauh" | "tidak_akurat" | "tanpa_kantor";
  face: Exclude<FaceVerdict, "tidak_cocok">;
  faceStatus: FaceStatus;
  jumped?: boolean;
  pulangWithoutMasuk?: boolean;
}): { status: DailyStatus; flags: DailyFlag[] } {
  const flags: DailyFlag[] = [];
  if (!input.inside) flags.push(input.outsideWhy === "tidak_akurat" ? "gps_tidak_akurat" : input.outsideWhy === "tanpa_kantor" ? "tanpa_titik_kantor" : "di_luar_area");
  if (input.face === "perlu_cek") flags.push("skor_rendah");
  if (input.faceStatus === "menunggu") flags.push("wajah_belum_disetujui");
  if (input.jumped) flags.push("lokasi_melompat");
  if (input.pulangWithoutMasuk) flags.push("belum_absen_masuk");
  return { status: flags.length ? "perlu_cek" : "sah", flags };
}

const number = (min: number, max: number) => z.number().finite().min(min).max(max);
const embeddingSchema = z.array(z.number().finite().min(-10).max(10)).length(EMBEDDING_SIZE, "Data wajah tidak lengkap. Ulangi dari awal.");
const signalSchema = z.object({ t: number(0, 1e13), blinkLeft: number(0, 1), blinkRight: number(0, 1), smileLeft: number(0, 1), smileRight: number(0, 1), yaw: number(-90, 90) });
const tokenSchema = z.string().regex(/^\d{10,13}\.[A-Za-z0-9_-]{16,64}\.[0-9a-f]{64}$/, "Sesi absen tidak dikenali. Ulangi dari awal.");
const uploadToken = z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal.");

export const startSchema = z.object({ kind: z.enum(DAILY_KINDS, { message: "Pilih absen masuk atau pulang." }) });

export const uploadStartSchema = z.object({
  token: tokenSchema,
  mime: z.enum(selfieMimes, { message: "Foto harus WebP atau JPEG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_SELFIE_BYTES, "Foto lebih dari 120 KB."),
});
export type UploadStart = z.infer<typeof uploadStartSchema>;

const selfieSchema = z.object({
  key: z.string().regex(selfieKeyPattern, "Unggahan tidak dikenali. Ulangi dari awal."),
  mime: z.enum(selfieMimes),
  size: z.number().int().min(1).max(MAX_SELFIE_BYTES),
  token: uploadToken,
});

export const locationSchema = z.object({
  lat: number(-90, 90),
  lng: number(-180, 180),
  accuracyM: number(0, 100_000),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const reasonSchema = z.object({
  kind: z.enum(REASON_KINDS, { message: "Pilih alasan." }),
  text: z.string().trim().max(300, "Keterangan paling banyak 300 karakter.").default(""),
}).refine(reason => reason.kind !== "lainnya" || reason.text.length >= 3, { message: "Tulis keterangan singkat untuk Lainnya.", path: ["text"] });

export const submitSchema = z.object({
  token: tokenSchema,
  embedding: embeddingSchema,
  /** A few embeddings across the challenge, to check it stayed one face. */
  frameEmbeddings: z.array(embeddingSchema).min(2).max(6),
  signals: z.array(signalSchema).min(1).max(LIVENESS.maxFrames),
  location: locationSchema,
  selfie: selfieSchema,
  reason: reasonSchema.optional(),
  /** The person agrees to the consent (first clock-in with an imported face). */
  consent: z.literal(CONSENT_VERSION).optional(),
});
export type SubmitInput = z.infer<typeof submitSchema>;

export const enrollUploadSchema = uploadStartSchema.omit({ token: true });
export const enrollSchema = z.object({
  consent: z.literal(CONSENT_VERSION, { message: "Setujui pemakaian data wajah dulu." }),
  token: tokenSchema,
  /** Three looks at the face (front, a little left, a little right), averaged into the reference. */
  embeddings: z.array(embeddingSchema).min(3).max(5),
  signals: z.array(signalSchema).min(1).max(LIVENESS.maxFrames),
  photo: z.object({
    key: z.string().regex(faceKeyPattern, "Unggahan tidak dikenali. Ulangi dari awal."),
    mime: z.enum(selfieMimes),
    size: z.number().int().min(1).max(MAX_SELFIE_BYTES),
    token: uploadToken,
  }),
});
export type EnrollInput = z.infer<typeof enrollSchema>;

export const officeSchema = z.object({
  name: z.string().trim().min(2, "Nama kantor minimal 2 karakter.").max(60, "Nama kantor paling banyak 60 karakter."),
  lat: number(-90, 90),
  lng: number(-180, 180),
  radiusM: z.number().int("Radius dalam meter bulat.").min(30, "Radius minimal 30 m.").max(1000, "Radius paling besar 1.000 m."),
  zone: z.enum(VIEWER_ZONES),
  active: z.boolean().default(true),
});
export type OfficeInput = z.infer<typeof officeSchema>;

export const reviewSchema = z.object({
  status: z.enum(["sah", "ditolak"]),
  note: z.string().trim().max(300, "Catatan paling banyak 300 karakter.").default(""),
}).refine(review => review.status !== "ditolak" || review.note.length >= 3, { message: "Tulis alasan penolakan.", path: ["note"] });

export const manualSchema = z.object({
  employeeId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(DAILY_KINDS),
  /** The clock time in the office's zone, "08:30". */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam tidak valid."),
  zone: z.enum(VIEWER_ZONES).default("WIB"),
  note: z.string().trim().min(3, "Tulis alasan dicatat manual.").max(300),
});
export type ManualInput = z.infer<typeof manualSchema>;

/** The instant of a clock time on a date in a zone: "2026-11-20", "08:30", WITA → 00:30Z. */
export function instantOf(date: string, time: string, zone: ViewerZone): string {
  const offset = { WIB: 7, WITA: 8, WIT: 9 }[zone];
  return new Date(Date.parse(`${date}T${time}:00Z`) - offset * 3_600_000).toISOString();
}

/** One clock-in as screens see it. */
export type DailyRecord = {
  id: string; kind: DailyKind; at: string; workDate: string; method: "wajah" | "manual"; status: DailyStatus; flags: DailyFlag[];
  officeName: string | null; distanceM: number | null; accuracyM: number | null; faceScore: number | null;
  reasonKind: ReasonKind | null; reasonText: string | null; hasSelfie: boolean; reviewNote: string | null;
};

/** What the person's clock-in screen needs. */
export type ClockInState = {
  ready: boolean;
  /** Why it is not ready (migration, storage), in plain words. */
  waiting: string | null;
  face: { status: FaceStatus; source: FaceSource; consented: boolean } | null;
  today: { workDate: string; masuk: DailyRecord | null; pulang: DailyRecord | null };
  offices: { id: string; name: string; lat: number; lng: number; radiusM: number; zone: ViewerZone }[];
  recent: DailyRecord[];
};

/** Admin → Absen harian: one row per person for a day. */
export type DayPerson = {
  employeeId: string; name: string; department: string;
  face: FaceStatus | null;
  masuk: DailyRecord | null; pulang: DailyRecord | null;
};
export type DayView = { date: string; people: DayPerson[]; offices: ClockInState["offices"] };

/** Admin → Wajah terdaftar: one row per reference face. */
export type FaceRow = {
  employeeId: string; name: string; department: string;
  status: FaceStatus; source: FaceSource; note: string | null;
  consented: boolean; hasPhoto: boolean; hasEmbedding: boolean; updatedAt: string;
};

/** What comes next for the person today: masuk, then pulang, then nothing. */
export function nextKind(today: ClockInState["today"]): DailyKind | null {
  if (!today.masuk && !today.pulang) return "masuk";
  return today.pulang ? null : "pulang";
}
