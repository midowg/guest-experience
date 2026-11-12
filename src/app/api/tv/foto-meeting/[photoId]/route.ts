import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { meetingPhotoImage } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ photoId: string }> };

/**
 * GET: a meeting photo of the "Foto meeting" template, for every TV (12 Nov 2026). Only a photo the
 * template plays now is given (a MoM sent in the last 30 days, not kept out of Telegram); the bytes
 * come through this site, so storage stays private. A photo never changes under its id.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { photoId } = await params;
    const image = z.uuid().safeParse(photoId).success ? await meetingPhotoImage(photoId) : null;
    if (!image) throw new ServiceError(404, "Foto tidak ditemukan.");
    return new Response(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": "image/jpeg", "Content-Length": String(image.bytes.byteLength), "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
      },
    });
  });
}
