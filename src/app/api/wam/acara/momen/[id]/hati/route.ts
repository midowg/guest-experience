import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { personLimit, setHeart } from "@/lib/server/main-wam/momen/feed";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function heart(request: Request, { params }: Params, on: boolean) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await personLimit("mw-foto-hati", viewer.id, 200);
    return success(await setHeart(viewer, id, on), on ? "Disukai." : "Batal suka.");
  });
}

/** PUT: suka (a photo the person sees). */
export function PUT(request: Request, context: Params) { return heart(request, context, true); }
/** DELETE: batal suka. */
export function DELETE(request: Request, context: Params) { return heart(request, context, false); }
