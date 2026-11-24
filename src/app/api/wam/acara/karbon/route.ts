import { checkOrigin, handle, readJson, success } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { saveMyCarbon } from "@/lib/server/main-wam/peserta/carbon";

export const dynamic = "force-dynamic";

/**
 * PUT {own, bottles, laptopHours, phoneCharges}: the person's own part of Jejak karbon (their row only), the
 * same answer Pra WAM's calculator takes. Everyone signed in while the module Jejak karbon is on; 404 when it is off.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    const context = await requireModuleApi("karbon");
    checkOrigin(request);
    return success(await saveMyCarbon(context, await readJson(request, 4_000), new Date()), "Jejak karbon disimpan.");
  });
}
