import { z } from "zod";
import { voteSchema } from "@/lib/main-wam/modul/awards";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { castVote } from "@/lib/server/main-wam/modul/awards";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PUT {nomineeId}: my vote in one category, changeable until it closes. Not BOD; module Voting on. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireActionApi("voting");
    checkOrigin(request);
    const categoryId = validate(z.uuid("Kategori tidak dikenali."), (await params).id);
    const { nomineeId } = validate(voteSchema, await readJson(request, 1_000));
    await limitPerson("vote", viewer.id, 30);
    await castVote(categoryId, nomineeId, viewer, new Date());
    return success({ categoryId, nomineeId }, "Pilihanmu terkirim.");
  });
}
