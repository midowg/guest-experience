import { NextResponse } from "next/server";
import { tvApi } from "@/lib/routes";
import { handle } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/config";
import { screenForKey, tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ key: string }> };

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
/** A screen side as the TV reports it: a whole number of pixels, or nothing. */
const side = (value: string | null) => (value && /^\d{2,5}$/.test(value) ? Number(value) : null);

/**
 * GET: what the TV with this key plays now. There is no sign-in: the key in the address is the
 * secret, and a wrong or removed key gets the same "not found" as any unknown address. `?w=&h=`
 * tell Admin WAM how big the screen is.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { key } = await params;
    const search = new URL(request.url).searchParams;
    const width = side(search.get("w")), height = side(search.get("h"));
    const screen = await screenForKey(key, width && height ? { width, height } : undefined, new Date(), search.get("item") ?? undefined);
    if (!screen) throw new ServiceError(404, "Tautan TV ini tidak berlaku.");
    return NextResponse.json({ ok: true, data: await tvFeed(slideId => tvApi.image(key, slideId), new Date(), screen) }, { headers: HEADERS });
  });
}
