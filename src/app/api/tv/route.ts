import { NextResponse } from "next/server";
import { TV_HOME_PATH, tvHomeApi } from "@/lib/routes";
import { handle } from "@/lib/server/http";
import { tvFeed } from "@/lib/server/pra-wam/tv";
import { noteVisit } from "@/lib/server/pra-wam/tv-visits";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/**
 * GET: what TVs play now, for the one address every TV may open (/tv). No sign-in and no TV named:
 * the board is open on purpose. The answer is the same for everyone and is read at most once in
 * ten seconds, however many TVs ask.
 */
export async function GET(request: Request) {
  return handle(async () => {
    // Which device asks, for Admin TV's Pantauan (the device, never the person; at most once in a few minutes each).
    const search = new URL(request.url).searchParams;
    const side = (value: string | null) => (value && /^\d{2,5}$/.test(value) ? Number(value) : null);
    await noteVisit(request, { address: TV_HOME_PATH, version: search.get("v") === "hp" ? "hp" : "papan", width: side(search.get("w")), height: side(search.get("h")) });
    return NextResponse.json({ ok: true, data: await tvFeed(tvHomeApi.image) }, { headers: HEADERS });
  });
}
