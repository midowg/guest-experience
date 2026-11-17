import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { mosaicManifest } from "@/lib/server/main-wam/momen/mosaic";

export const dynamic = "force-dynamic";

/**
 * GET: the Mozaik's manifest (grid, letter cells, tiles with short-lived addresses, progress; "mine"
 * for the person). Module Mozaik only (404 while it is off). ETag: polling every 45 seconds costs a
 * 304 while nothing changed.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const context = await requireModuleApi("mozaik");
    const manifest = await mosaicManifest(context);
    const etag = `"${manifest.version}"`;
    const headers = { "Cache-Control": "private, no-cache", ETag: etag, Vary: "Cookie" };
    if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ ok: true, data: manifest, message: "Mozaik dimuat." }, { headers });
  });
}
