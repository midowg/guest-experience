import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { mosaicHead, mosaicManifest } from "@/lib/server/main-wam/momen/mosaic";

export const dynamic = "force-dynamic";

/** The ETags of If-None-Match ("*", a list, weak ones compared as strong for a GET). */
const matches = (header: string | null, etag: string) =>
  !!header && header.split(",").some(item => { const tag = item.trim().replace(/^W\//, ""); return tag === "*" || tag === etag; });

/**
 * GET: the Mozaik's manifest (grid, letter cells, tiles with short-lived addresses, progress; "mine"
 * for the person). Module Mozaik only (404 while it is off). The version is worked out first, from
 * two small queries (audit R3): polling every 45 seconds costs a 304 while nothing changed, without
 * building the manifest or signing a single tile address.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const context = await requireModuleApi("mozaik");
    const now = new Date();
    const head = await mosaicHead(context, now);
    const etag = `"${head.version}"`;
    const headers = { "Cache-Control": "private, no-cache", ETag: etag, Vary: "Cookie" };
    if (matches(request.headers.get("if-none-match"), etag)) return new NextResponse(null, { status: 304, headers });
    const manifest = await mosaicManifest(context, now, head);
    return NextResponse.json({ ok: true, data: manifest, message: "Mozaik dimuat." }, { headers });
  });
}
