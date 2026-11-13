import { z } from "zod";
import { minutesFileName } from "@/lib/pra-wam/minutes-message";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, validate } from "@/lib/server/http";
import { minutesForConsole } from "@/lib/server/pra-wam/minutes";
import { minutesDocx } from "@/lib/server/pra-wam/minutes-docx";
import { minutePhotoBytes } from "@/lib/server/pra-wam/minutes-photos";
import { minutesMessage } from "@/lib/server/pra-wam/minutes-telegram";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sessionId: string }> };

/** What one answer may carry (Vercel stops at about 4.5 MB): photos beyond it are left out. */
const PHOTO_BUDGET = 3_500_000;

/**
 * GET: a sent MoM as a Word file for Arsip MoM (any admin, 13 Nov 2026), to change it: the same
 * form FRM.05.00.00.027 as the PDF, with its photos as long as the file stays small enough to send.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const { session, minutes, hod } = await minutesForConsole(validate(z.uuid(), (await params).sessionId));
    const message = await minutesMessage(session, minutes, hod);
    const photos: Uint8Array[] = [];
    let total = 0;
    for (const bytes of await minutePhotoBytes(session.id).catch(() => [] as Uint8Array[])) {
      if (total + bytes.length > PHOTO_BUDGET) break;
      photos.push(bytes); total += bytes.length;
    }
    const bytes = minutesDocx(message, photos);
    const name = minutesFileName(message).replace(/\.pdf$/, ".docx");
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store",
      },
    });
  });
}
