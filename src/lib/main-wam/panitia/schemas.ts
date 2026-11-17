import { z } from "zod";
import { PHOTO_STATUSES } from "../types";

/*
 * What the panitia and BOD APIs accept (validated with zod on the server; the forms check the same
 * limits as they are typed). Words are the ones the screens show.
 */

const id = z.uuid("Data tidak dikenali. Muat ulang halaman.");
/** A row's version: its updated_at as the server sent it. */
const version = z.string().min(10).max(40);
const instant = z.iso.datetime({ offset: true, message: "Jam tidak dikenali." });

/** PATCH mainWamApi.rundownSession(id): Ubah jam (K03), Pindah tempat, Batalkan / Kembalikan sesi. */
export const rundownChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("jam"),
    version,
    startsAt: instant,
    endsAt: instant.nullable(),
    /** The sessions after it that move by the same amount, as the panitia saw them. */
    shift: z.array(z.object({ id, version })).max(40).default([]),
    notify: z.boolean(),
  }),
  z.object({ action: z.literal("tempat"), version, place: z.string().trim().min(2, "Tulis tempatnya.").max(200, "Paling panjang 200 karakter."), notify: z.boolean() }),
  z.object({ action: z.literal("batal"), version, notify: z.boolean() }),
  z.object({ action: z.literal("kembali"), version, notify: z.boolean() }),
], { message: "Perubahan tidak dikenali." });
export type RundownChangeInput = z.infer<typeof rundownChangeSchema>;

/** POST mainWamApi.attendance(sesiId): Catat hadir (K05), or its undo. */
export const presentSchema = z.object({ employeeId: id, present: z.boolean() });
export type PresentInput = z.infer<typeof presentSchema>;

export const ANNOUNCE_TITLE_MAX = 60;
export const ANNOUNCE_BODY_MAX = 300;
/** POST mainWamApi.announcements: Kirim pengumuman (K06). */
export const announceSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi.").min(2, "Judul terlalu pendek.").max(ANNOUNCE_TITLE_MAX, `Judul paling panjang ${ANNOUNCE_TITLE_MAX} karakter.`),
  body: z.string().trim().max(ANNOUNCE_BODY_MAX, `Isi paling panjang ${ANNOUNCE_BODY_MAX} karakter.`).default(""),
  audience: z.discriminatedUnion("type", [
    z.object({ type: z.literal("semua") }),
    z.object({ type: z.literal("kelompok"), groupIds: z.array(id).min(1, "Pilih kelompoknya.").max(50) }),
    z.object({ type: z.literal("departemen"), departments: z.array(z.string().trim().min(1).max(120)).min(1, "Pilih departemennya.").max(50) }),
    z.object({ type: z.literal("panitia") }),
  ], { message: "Pilih penerima." }),
  /** Sematkan di Beranda until then; null = not pinned. */
  pinnedUntil: instant.nullable().default(null),
});
export type AnnounceInput = z.infer<typeof announceSchema>;

/** PATCH mainWamApi.announcement(id): Lepas dari Beranda. */
export const announcementPatchSchema = z.object({ pinnedUntil: z.null() });

/** Quick reasons for Sembunyikan and Hapus (labels: moderationReasonLabels). */
export const MODERATION_REASONS = ["keberatan", "tidak_pantas", "data_pribadi"] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];
export const MODERATION_NOTE_MAX = 200;
/**
 * POST mainWamApi.moderatePhoto(id): the decision and the status the panitia saw (someone else may
 * have decided first), and why: a quick reason and/or a short note, both optional (audit L8; kept in
 * mw_moderation_log.reason, never shown to the uploader or the reporters).
 */
export const moderateSchema = z.object({
  action: z.enum(["sembunyikan", "tampilkan", "hapus"], { message: "Tindakan tidak dikenali." }),
  from: z.enum(PHOTO_STATUSES),
  reason: z.enum(MODERATION_REASONS, { message: "Alasan tidak dikenali." }).nullable().default(null),
  note: z.string().trim().max(MODERATION_NOTE_MAX, `Catatan paling panjang ${MODERATION_NOTE_MAX} karakter.`).default(""),
});
/** What the server works with (after defaults). */
export type ModerateInput = z.infer<typeof moderateSchema>;
/** What a screen sends (reason and note may be left out). */
export type ModerateRequest = z.input<typeof moderateSchema>;
