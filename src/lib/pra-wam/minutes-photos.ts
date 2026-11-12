import { z } from "zod";

/*
 * Foto meeting di MoM (12 Nov 2026, migration 202611120005): every meeting has its photos. The
 * browser makes each picked photo smaller and saves it as JPEG (so the PDF can carry it); the
 * server agrees the size, the browser puts it in private storage, and the server checks its first
 * bytes before keeping it. At most ten a meeting.
 *
 * The standard (12 Nov 2026, migration 202611120006, asked so the photos also look good on the
 * office TV): Full HD, at most 1920 px on the long side and at most 1 MB, at a JPEG quality that
 * never goes below 0.8 so a photo is never blocky; a very detailed photo that still does not fit
 * is made 1600 px instead (still sharper than HD). Before that migration: 1280 px and 400 KB.
 * The PDF gets its own smaller copy of each photo (made on the server), so it stays light.
 */

export type MomPhotoRule = { sides: readonly number[]; bytes: number; steps: readonly number[] };
export const MOM_PHOTO_HD: MomPhotoRule = { sides: [1920, 1600], bytes: 1024 * 1024, steps: [0.92, 0.88, 0.84, 0.8] };
export const MOM_PHOTO_BEFORE_HD: MomPhotoRule = { sides: [1280], bytes: 400 * 1024, steps: [0.85, 0.78, 0.7, 0.62, 0.54, 0.46] };
export const momPhotoRule = (hd: boolean) => (hd ? MOM_PHOTO_HD : MOM_PHOTO_BEFORE_HD);
/** "1 MB", "400 KB". */
export const photoLimitLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`);
export const MOM_PHOTO_SIDE = MOM_PHOTO_HD.sides[0];
export const MOM_PHOTO_BYTES = MOM_PHOTO_HD.bytes;
export const MOM_PHOTOS_MAX = 10;
export const MOM_PHOTO_MIGRATION = "202611120005_pw_minutes_frm.sql";
/** Full HD photos, meeting photos on TV, and Lemari MoM. */
export const MOM_CABINET_MIGRATION = "202611120006_pw_mom_cabinet.sql";

/** Where a meeting's photo lives in storage; the migration's check allows only this shape. */
export const momPhotoKeyPattern = /^pra-wam\/mom\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;
export const momPhotoKeyFor = (sessionId: string, id: string) => `pra-wam/mom/${sessionId}/${id}.jpg`;
/** The key is a photo of this meeting: nobody confirms into another meeting's folder. */
export const isMeetingPhotoKey = (key: string, sessionId: string) => momPhotoKeyPattern.test(key) && key.startsWith(`pra-wam/mom/${sessionId}/`);

/** The size to draw a picture at so its long side is at most `max`, never larger than it is. */
export function fitWithin(width: number, height: number, max = MOM_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** FF D8 FF: a JPEG. */
export const isJpeg = (start: Uint8Array) => start.length >= 3 && start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff;

export const momPhotoStartSchema = z.object({
  size: z.number().int().min(1, "Berkas kosong.").max(MOM_PHOTO_BYTES, `Foto lebih dari ${photoLimitLabel(MOM_PHOTO_BYTES)}.`),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
});
export type MomPhotoStart = z.infer<typeof momPhotoStartSchema>;
export const momPhotoConfirmSchema = momPhotoStartSchema.extend({
  key: z.string().regex(momPhotoKeyPattern, "Unggahan tidak dikenali. Ulangi dari awal."),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});
