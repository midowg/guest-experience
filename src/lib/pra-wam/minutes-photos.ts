import { z } from "zod";

/*
 * Foto meeting di MoM (12 Nov 2026, migration 202611120005): every meeting has its photos. The
 * browser makes each picked photo at most 1280 px on its long side and saves it as JPEG of at most
 * 400 KB (JPEG, so the PDF can carry it); the server agrees the size, the browser puts it in
 * private storage, and the server checks its first bytes before keeping it. At most ten a meeting,
 * so the PDF with every photo stays small enough to download and to send to Telegram.
 */

export const MOM_PHOTO_SIDE = 1280;
export const MOM_PHOTO_BYTES = 400 * 1024;
export const MOM_PHOTO_STEPS = [0.85, 0.78, 0.7, 0.62, 0.54, 0.46] as const;
export const MOM_PHOTOS_MAX = 10;
export const MOM_PHOTO_MIGRATION = "202611120005_pw_minutes_frm.sql";

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
  size: z.number().int().min(1, "Berkas kosong.").max(MOM_PHOTO_BYTES, "Foto lebih dari 400 KB."),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
});
export type MomPhotoStart = z.infer<typeof momPhotoStartSchema>;
export const momPhotoConfirmSchema = momPhotoStartSchema.extend({
  key: z.string().regex(momPhotoKeyPattern, "Unggahan tidak dikenali. Ulangi dari awal."),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});
