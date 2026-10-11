import { rsvpSchema } from "@/lib/validation";
import { submitInvitationResponse } from "@/lib/server/responses";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string; token: string }> };

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "invitation-rsvp", 15);
    const { slug, token } = await params;
    if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ ok: false, message: "Undangan tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const payload = validate(rsvpSchema, await readJson(request, 30_000));
    return success(await submitInvitationResponse(slug, token, payload), "Konfirmasi kehadiran tersimpan. Jawaban dapat diperbarui sampai batas RSVP.");
  });
}
