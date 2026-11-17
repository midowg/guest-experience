import { z } from "zod";
import { approveSchema } from "@/lib/main-wam/modul/awards";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { approveWinner } from "@/lib/server/main-wam/modul/awards";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {nomineeId}: a BOD approves the winner (voting: after it closes; jury: any time). Panitia are told. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireActionApi("awarding-setujui");
    checkOrigin(request);
    const categoryId = validate(z.uuid("Kategori tidak dikenali."), (await params).id);
    const { nomineeId } = validate(approveSchema, await readJson(request, 1_000));
    return success(await approveWinner(categoryId, nomineeId, viewer, new Date()), "Panitia diberi kabar.");
  });
}
