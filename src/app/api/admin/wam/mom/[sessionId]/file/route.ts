import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { handle, validate } from "@/lib/server/http";
import { minutesForConsole } from "@/lib/server/pra-wam/minutes";
import { minuteFileAddress, minuteFileBytes } from "@/lib/server/pra-wam/minutes-file";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sessionId: string }> };

/**
 * GET: a sent MoM's uploaded file for Arsip MoM (any admin, 13 Nov 2026): to its storage address,
 * or with ?berkas=1 its bytes, for a zip made in the browser.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const { session } = await minutesForConsole(validate(z.uuid(), (await params).sessionId)); // a sent MoM only
    if (new URL(request.url).searchParams.get("berkas") === "1") {
      const file = await minuteFileBytes(session.id);
      if (!file) throw new ServiceError(404, "Berkas tidak ditemukan.");
      return new Response(file.bytes as BodyInit, { headers: { "Content-Type": file.type, "Cache-Control": "private, no-store" } });
    }
    return new Response(null, { status: 302, headers: { Location: await minuteFileAddress(session.id), "Cache-Control": "private, no-store" } });
  });
}
