import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { videoAddress } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ itemId: string }> };

/**
 * GET: a video file of the playlist, for a TV. Storage stays private: the answer sends the player
 * on to a short-lived address there, which answers in parts as a video player asks. Only for a
 * video row that is shown (or that takes the TVs over).
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { itemId } = await params;
    const address = z.uuid().safeParse(itemId).success ? await videoAddress(itemId) : null;
    if (!address) throw new ServiceError(404, "Video tidak ditemukan.");
    return new Response(null, { status: 302, headers: { Location: address, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
  });
}
