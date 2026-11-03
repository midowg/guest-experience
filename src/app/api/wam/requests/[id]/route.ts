import { z } from "zod";
import { reviewSchema } from "@/lib/pra-wam/requests";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { reviewRequest, withdrawRequest } from "@/lib/server/pra-wam/requests";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {approve, note}: panitia answers a request. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { approve, note } = validate(reviewSchema, await readJson(request, 4_000));
    await reviewRequest(validate(z.uuid(), (await params).id), approve, note, member);
    return success(null, approve ? "Disetujui. Sesi dipindah dan peserta diberi tahu." : "Ditolak. Pengaju diberi tahu.");
  });
}

/** DELETE: the person who asked withdraws while it still waits. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await withdrawRequest(validate(z.uuid(), (await params).id), member);
    return success(null, "Permintaan ditarik.");
  });
}
