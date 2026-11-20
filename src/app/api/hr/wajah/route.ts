import { enrollSchema } from "@/lib/hr/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { submitEnroll } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: enrolment, step three: the consent, three looks and the photo. Active at once when it matches the GreatDay photo. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-wajah", 20);
    const answer = await submitEnroll(member, validate(enrollSchema, await readJson(request, 150_000)));
    return success(answer, answer.status === "aktif" ? "Wajahmu terdaftar." : "Wajahmu terdaftar. Admin HR akan memeriksanya; sementara itu absenmu tetap tercatat.");
  });
}
