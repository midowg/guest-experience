import { claimSchema } from "@/lib/coffee/schemas";
import { submitClaim } from "@/lib/server/coffee/claims";
import { COFFEE_NETWORK_LIMIT, limitCoffeePerson } from "@/lib/server/coffee/rate";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST {slug, temperature, sugar, ice, key}: one claim of the signed-in person. 409 when this month's quota is full. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    // The office shares one address: each person is counted, the address only as an outer wall.
    await enforceRateLimit(request, "coffee-klaim", COFFEE_NETWORK_LIMIT);
    await limitCoffeePerson("klaim", member.id, 20);
    const input = validate(claimSchema, await readJson(request, 2_000));
    return success(await submitClaim(member, input), "Pengajuan terkirim.");
  });
}
