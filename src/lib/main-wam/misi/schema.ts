import { z } from "zod";
import { MAX_LARGE_BYTES, MAX_THUMB_BYTES, MAX_TILE_BYTES } from "@/lib/main-wam/momen/filters";
import { rulesSchema, TAG_MAX, tagRuleOf, type MissionRule } from "./rules";
import { MISSION_CREDITS, MISSION_KINDS } from "./types";

/*
 * What the Misi APIs accept (zod, shared by the forms, the routes and the tests): an admin's mission,
 * the settings, a review, manual points; and a participant's position and photo.
 */

const iso = z.iso.datetime({ offset: true, message: "Tanggal dan jam belum lengkap." });
const optionalIso = iso.nullable().default(null);

export const missionSchema = z.object({
  title: z.string().trim().min(2, "Nama misi minimal 2 huruf.").max(100, "Nama misi paling banyak 100 karakter."),
  description: z.string().trim().max(500, "Penjelasan paling banyak 500 karakter.").default(""),
  kind: z.enum(MISSION_KINDS, "Pilih jenis misi."),
  points: z.number("Isi jumlah poin.").int("Poin berupa bilangan bulat.").min(0, "Poin tidak boleh negatif.").max(1000, "Poin paling banyak 1.000."),
  placeName: z.string().trim().max(100, "Nama tempat paling banyak 100 karakter.").default(""),
  latitude: z.number().min(-90, "Garis lintang di antara -90 dan 90.").max(90, "Garis lintang di antara -90 dan 90.").nullable().default(null),
  longitude: z.number().min(-180, "Garis bujur di antara -180 dan 180.").max(180, "Garis bujur di antara -180 dan 180.").nullable().default(null),
  radiusM: z.number().int("Radius berupa bilangan bulat.").min(10, "Radius paling kecil 10 m.").max(5000, "Radius paling besar 5.000 m.").nullable().default(null),
  sessionId: z.uuid("Sesi tidak dikenali.").nullable().default(null),
  credit: z.enum(MISSION_CREDITS, "Pilih siapa yang mencatat.").default("panitia"),
  review: z.boolean().default(false),
  opensAt: optionalIso,
  closesAt: optionalIso,
  sort: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(false),
  /** The TNC of a photo mission (rules.ts). A place or a window in it also fills the older columns. */
  rules: rulesSchema.default([]),
}).strict().superRefine((value, context) => {
  if (value.rules.length && value.kind !== "foto") context.addIssue({ code: "custom", path: ["rules"], message: "Aturan hanya untuk misi foto." });
  if ((value.latitude === null) !== (value.longitude === null)) context.addIssue({ code: "custom", path: ["longitude"], message: "Isi garis lintang dan garis bujur bersama." });
  if (value.kind === "checkin" && (value.latitude === null || value.longitude === null)) context.addIssue({ code: "custom", path: ["latitude"], message: "Check-in perlu titik lokasi." });
  if (value.kind === "sesi" && value.active && !value.sessionId) context.addIssue({ code: "custom", path: ["sessionId"], message: "Misi sesi yang aktif perlu sesinya." });
  if (value.opensAt && value.closesAt && Date.parse(value.closesAt) <= Date.parse(value.opensAt)) context.addIssue({ code: "custom", path: ["closesAt"], message: "Jam tutup harus setelah jam buka." });
});
export type MissionInput = z.infer<typeof missionSchema>;

/**
 * The mission's row for the database. A kind keeps only what it uses (a sesi mission has no place). The
 * rules' place and window are mirrored into the older columns (the position check and the opening
 * hours read those); `rules` is written only when there are some, so a mission without rules saves
 * before migration 202611300001.
 */
export const missionRow = (input: MissionInput) => {
  const lokasi = input.rules.find((rule): rule is Extract<MissionRule, { type: "lokasi" }> => rule.type === "lokasi");
  const waktu = input.rules.find((rule): rule is Extract<MissionRule, { type: "waktu" }> => rule.type === "waktu");
  return {
    title: input.title, description: input.description, kind: input.kind, points: input.points,
    place_name: input.kind === "sesi" ? "" : lokasi?.name ?? input.placeName,
    latitude: input.kind === "sesi" ? null : lokasi?.latitude ?? input.latitude, longitude: input.kind === "sesi" ? null : lokasi?.longitude ?? input.longitude,
    radius_m: input.kind === "sesi" ? null : lokasi?.radiusM ?? input.radiusM,
    session_id: input.kind === "sesi" ? input.sessionId : null, credit: input.kind === "sesi" ? input.credit : "panitia",
    review: input.kind === "foto" ? input.review : false,
    opens_at: waktu ? waktu.start : input.opensAt, closes_at: waktu ? waktu.end : input.closesAt, sort: input.sort, active: input.active, updated_at: new Date().toISOString(),
    ...(input.rules.length ? { rules: input.rules } : {}),
  };
};
export { tagRuleOf };

export const settingsSchema = z.object({
  defaultRadiusM: z.number().int("Radius berupa bilangan bulat.").min(10, "Radius paling kecil 10 m.").max(1000, "Radius paling besar 1.000 m."),
  maxAccuracyM: z.number().int("Ketelitian berupa bilangan bulat.").min(10, "Ketelitian paling kecil 10 m.").max(1000, "Ketelitian paling besar 1.000 m."),
  leaderboardOpen: z.boolean(),
}).strict();
export type SettingsInput = z.infer<typeof settingsSchema>;

/** An admin's decision on one proof. */
export const reviewSchema = z.object({
  status: z.enum(["disetujui", "ditolak"], "Pilih setujui atau tolak."),
  note: z.string().trim().max(300, "Catatan paling banyak 300 karakter.").default(""),
}).strict().refine(value => value.status === "disetujui" || value.note.length >= 2, { path: ["note"], message: "Tulis alasan penolakan agar peserta tahu." });
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Panitia's hand: a person finished a sesi mission (or any mission, with a note) without a proof. */
export const grantSchema = z.object({
  employeeId: z.uuid("Orang tidak dikenali."),
  note: z.string().trim().max(300, "Catatan paling banyak 300 karakter.").default(""),
}).strict();

/** Points by hand (a bonus, a correction): never zero, a short reason. */
export const manualPointsSchema = z.object({
  employeeId: z.uuid("Orang tidak dikenali."),
  points: z.number("Isi jumlah poin.").int("Poin berupa bilangan bulat.").min(-1000, "Paling sedikit -1.000.").max(1000, "Paling banyak 1.000.")
    .refine(value => value !== 0, "Poin tidak boleh 0."),
  note: z.string().trim().min(2, "Tulis alasannya.").max(200, "Alasan paling banyak 200 karakter."),
}).strict();

/** A position as the phone read it (navigator.geolocation). `at` is required: without it the freshness check could be skipped. */
export const positionSchema = z.object({
  latitude: z.number("Lokasi belum terbaca.").min(-90).max(90),
  longitude: z.number("Lokasi belum terbaca.").min(-180).max(180),
  accuracy: z.number("Lokasi belum terbaca.").min(0).max(100_000),
  at: iso,
}).strict();
export type PositionInput = z.infer<typeof positionSchema>;

/** Step one of a mission photo: where the person is, and the two files about to be uploaded. */
export const photoStartSchema = z.object({
  clientId: z.uuid("Foto tidak dikenali."),
  position: positionSchema,
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_LARGE_BYTES, "Foto terlalu besar. Ambil ulang fotonya."),
  thumbSize: z.number().int().min(1, "Berkas kosong.").max(MAX_THUMB_BYTES, "Foto terlalu besar. Ambil ulang fotonya."),
  tileSize: z.number().int().min(1, "Berkas kosong.").max(MAX_TILE_BYTES, "Foto terlalu besar. Ambil ulang fotonya."),
  width: z.number().int().min(1).max(4_000),
  height: z.number().int().min(1).max(4_000),
  /** The people tagged in the photo (employee ids); the mission's tag rule says how many and who. */
  tags: z.array(z.uuid("Orang yang ditandai tidak dikenali.")).max(TAG_MAX, `Paling banyak ${TAG_MAX} orang.`).default([]),
}).strict();
export type PhotoStartInput = z.infer<typeof photoStartSchema>;
export const photoConfirmSchema = photoStartSchema.extend({ token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal.") }).strict();
export type PhotoConfirmInput = z.infer<typeof photoConfirmSchema>;

/** A person lifting their own tag off a photo. */
export const untagSchema = z.object({ photoId: z.uuid("Foto tidak dikenali.") }).strict();
