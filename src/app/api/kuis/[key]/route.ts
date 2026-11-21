import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { screenState } from "@/lib/server/main-wam/kuis/screen";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ key: string }> };

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/**
 * GET: Kuis live's big screen (rancangan §7). No sign-in, as an office TV: the key in the address is the
 * secret; a wrong, replaced or removed key, or the module switched off, gets the same "not found".
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { key } = await params;
    const state = await screenState(key);
    if (!state) throw new ServiceError(404, "Tautan layar kuis ini tidak berlaku.");
    return NextResponse.json({ ok: true, data: state }, { headers: HEADERS });
  });
}
