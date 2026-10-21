import { z } from "zod";
import { checkIn, undoCheckIn } from "@/lib/server/tickets";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const target = z.union([
  z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{22,32}$/, "Kode tiket tidak valid.") }),
  z.object({ rsvp_id: z.uuid() }),
]);

/** POST { code } from a scan, or { rsvp_id } from the name list. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const result = await checkIn(id, validate(target, await readJson(request, 2_000)));
    return success(result, result.first_time ? `${result.guest.name} berhasil check-in.` : `${result.guest.name} sudah check-in sebelumnya.`);
  });
}

/** DELETE { ticket_id }: clear a mistaken check-in. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const { ticket_id } = validate(z.object({ ticket_id: z.uuid() }), await readJson(request, 2_000));
    await undoCheckIn(id, ticket_id);
    return success(null, "Check-in dibatalkan.");
  });
}
