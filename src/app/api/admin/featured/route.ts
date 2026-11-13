import { z } from "zod";
import { getFeaturedEventId, setFeaturedEvent } from "@/lib/server/events";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { currentAdmin, requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
const schema = z.object({ eventId: z.union([z.uuid(), z.null()]) });

export async function GET() {
  return handle(async () => { await requireApiAdmin(); return success({ eventId: await getFeaturedEventId() }, "Acara tayang dimuat."); });
}

export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    // The front page shows one event for everyone: a personal admin needs every event (13 Nov 2026).
    const actor = await currentAdmin();
    if (actor?.kind === "person" && !actor.grant.allEvents) throw new ServiceError(403, "Mengatur acara di halaman utama perlu akses Semua acara. Minta super admin.");
    const { eventId } = validate(schema, await readJson(request, 10_000));
    const saved = await setFeaturedEvent(eventId);
    return success({ eventId: saved }, saved ? "Acara ini sekarang tayang di halaman utama." : "Halaman utama tidak menayangkan acara.");
  });
}
