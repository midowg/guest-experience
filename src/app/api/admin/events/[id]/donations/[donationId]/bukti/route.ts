import { z } from "zod";
import { proofAddress } from "@/lib/server/donations";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** GET: a ten-minute address to look at one proof of transfer (the bucket is private). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; donationId: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    const { id, donationId } = await params;
    const eventId = validate(z.uuid(), id);
    await requireEventAccess(eventId);
    return success({ url: await proofAddress(eventId, validate(z.uuid(), donationId)) }, "Bukti transfer siap dibuka.");
  });
}
