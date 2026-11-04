import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { orderSchema, saveOrder } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";

/** PUT {sections} or {sectionId, questions}: a new order, every item exactly once (any admin). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await saveOrder(validate(orderSchema, await readJson(request, 20_000))), "Urutan disimpan.");
  });
}
