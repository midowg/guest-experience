import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { slideImage } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slideId: string }> };

/**
 * GET: one picture of the loop, for the one address every TV may open (/tv). Only pictures that
 * are in the loop are given. The bytes come through this site, so storage stays private; a
 * picture never changes under its id, so the TV keeps it.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { slideId } = await params;
    const image = z.uuid().safeParse(slideId).success ? await slideImage(slideId, true) : null;
    if (!image) throw new ServiceError(404, "Gambar tidak ditemukan.");
    return new Response(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.type, "Content-Length": String(image.bytes.byteLength), "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=31536000, immutable", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
      },
    });
  });
}
