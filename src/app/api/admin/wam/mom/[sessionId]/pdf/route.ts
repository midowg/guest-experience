import { z } from "zod";
import { minutesFileName } from "@/lib/pra-wam/minutes-message";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, validate } from "@/lib/server/http";
import { minutesForConsole } from "@/lib/server/pra-wam/minutes";
import { minutesMessage, minutesPdfWithPhotos } from "@/lib/server/pra-wam/minutes-telegram";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sessionId: string }> };

/** GET: a sent MoM's PDF for Arsip MoM (any admin): the same one its Telegram groups got, with its photos. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const { session, minutes, hod } = await minutesForConsole(validate(z.uuid(), (await params).sessionId));
    const message = await minutesMessage(session, minutes, hod);
    const bytes = await minutesPdfWithPhotos(session.id, message);
    return new Response(bytes as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${minutesFileName(message)}"`, "Cache-Control": "private, no-store" },
    });
  });
}
