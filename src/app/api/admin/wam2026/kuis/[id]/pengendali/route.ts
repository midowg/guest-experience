import { z } from "zod";
import { hostSchema } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { addHost, actorName } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {employeeId}: a pengendali of this quiz (holders of Admin WAM 2026 run every quiz anyway, with their WAM account). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Kuis tidak dikenali."), (await params).id);
    const { employeeId } = validate(hostSchema, await readJson(request, 1_000));
    await addHost(id, employeeId, await actorName());
    return success(null, "Pengendali ditambahkan.");
  });
}
