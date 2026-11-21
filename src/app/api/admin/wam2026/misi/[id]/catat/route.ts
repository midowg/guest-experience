import { z } from "zod";
import { grantSchema } from "@/lib/main-wam/misi/schema";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { grantCompletion } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {employeeId, note}: record that a person did this mission (panitia's hand); the points follow at once. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const input = validate(grantSchema, await readJson(request, 1_000));
    await grantCompletion(id, input.employeeId, input.note);
    return success(null, "Tercatat selesai. Poin masuk.");
  });
}
