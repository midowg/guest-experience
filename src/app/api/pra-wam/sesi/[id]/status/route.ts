import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { setSessionStatus } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {status}: back to draft (off the agenda), or cancelled (room freed) — panitia. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const { status } = validate(z.object({ status: z.enum(["draf", "batal"]) }), await readJson(request, 1_000));
    return success(await setSessionStatus(id, status, member), status === "batal" ? "Sesi dibatalkan. Ruangnya kembali tersedia." : "Sesi kembali menjadi draf.");
  });
}
