import { carbonAnswerInputSchema } from "@/lib/pra-wam/carbon";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveMyCarbon } from "@/lib/server/pra-wam/carbon";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** PUT {own, bottles, laptopHours, phoneCharges}: the participant's own part of Jejak karbon (their row only). */
export async function PUT(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const travel = await saveMyCarbon(member, validate(carbonAnswerInputSchema, await readJson(request, 4_000)));
    return success(travel, "Jejak karbon disimpan.");
  });
}
