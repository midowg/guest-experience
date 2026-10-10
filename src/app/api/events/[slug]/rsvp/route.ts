import { rsvpSchema } from "@/lib/validation";
import { submitPublicResponse } from "@/lib/server/responses";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "rsvp", 15);
    const { slug } = await params;
    const payload = validate(rsvpSchema, await readJson(request, 30_000));
    const result = await submitPublicResponse("rsvp", slug, { ...payload });
    return success(result, "Konfirmasi kehadiran tersimpan.");
  });
}
