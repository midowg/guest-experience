import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { wellbeingActor } from "@/lib/server/wellbeing/admin";
import { decideClaim } from "@/lib/server/wellbeing/rewards";
import { claimDecisionSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const said = { approve: "Klaim disetujui.", deliver: "Hadiah ditandai sudah diserahkan.", reject: "Klaim ditolak. Poinnya kembali ke saldo karyawan." } as const;

/** POST { action, reason, code }: approve a claim, mark it handed over (a typed-in voucher code with it), or reject it with a reason. */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) throw new ServiceError(404, "Klaim tidak ditemukan.");
    const input = validate(claimDecisionSchema, await readJson(request, 2_000));
    return success(await decideClaim(id.data, input, await wellbeingActor()), said[input.action]);
  });
}