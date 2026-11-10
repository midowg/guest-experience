import { NextResponse } from "next/server";
import { tvHomeApi } from "@/lib/routes";
import { handle } from "@/lib/server/http";
import { tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/**
 * GET: what TVs play now, for the one address every TV may open (/tv). No sign-in and no TV named:
 * the board is open on purpose. The answer is the same for everyone and is read at most once in
 * ten seconds, however many TVs ask.
 */
export async function GET() {
  return handle(async () => NextResponse.json({ ok: true, data: await tvFeed(tvHomeApi.image) }, { headers: HEADERS }));
}
