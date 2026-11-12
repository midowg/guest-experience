import { z } from "zod";
import { minutesFileName } from "@/lib/pra-wam/minutes-message";
import { handle, validate } from "@/lib/server/http";
import { minutesForPdf } from "@/lib/server/pra-wam/minutes";
import { minutesMessage, minutesPdfWithPhotos } from "@/lib/server/pra-wam/minutes-telegram";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: the MoM as a PDF (12 Nov 2026), the same one Telegram gets (with the meeting's photos), for whoever may read it. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    const { session, minutes, hod } = await minutesForPdf(validate(z.uuid(), (await params).id), member);
    const message = await minutesMessage(session, minutes, hod);
    const draft = !minutes.sentAt;
    const bytes = await minutesPdfWithPhotos(session.id, draft ? { ...message, title: `[DRAF] ${message.title}` } : message);
    const name = draft ? minutesFileName(message).replace(/\.pdf$/, "_DRAF.pdf") : minutesFileName(message);
    return new Response(bytes as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  });
}
