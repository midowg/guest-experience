import { z } from "zod";
import { getFeaturedEventId, setFeaturedEvent } from "@/lib/server/events";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const schema = z.object({ eventId: z.union([z.uuid(), z.null()]) });

export async function GET() {
  return handle(async () => success({ eventId: await getFeaturedEventId() }, "Acara tayang dimuat."));
}

export async function PUT(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const { eventId } = validate(schema, await readJson(request, 10_000));
    const saved = await setFeaturedEvent(eventId);
    return success({ eventId: saved }, saved ? "Acara ini sekarang tayang di halaman utama." : "Halaman utama tidak menayangkan acara.");
  });
}
