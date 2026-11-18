import { z } from "zod";
import { reactionSchema } from "@/lib/main-wam/momen/filters";
import { REACTIONS_PER_10_MINUTES, REACTORS_PER_10_MINUTES } from "@/lib/main-wam/momen/reactions";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { personLimit, photoReactors, setReaction } from "@/lib/server/main-wam/momen/feed";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: daftar siapa bereaksi apa pada foto yang bisa dilihat (foto tersembunyi atau di luar jendela = 404). Tidak disimpan di cache. */
export function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    const id = validate(z.uuid(), (await params).id);
    await personLimit("mw-foto-reaktor", viewer.id, REACTORS_PER_10_MINUTES);
    return success(await photoReactors(viewer, id)); // success() answers Cache-Control: no-store
  });
}

/** PUT {emoji}: bereaksi pada foto rekan yang bisa dilihat (satu reaksi per orang; emoji lain menggantikan yang lama). */
export function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const input = validate(reactionSchema, await readJson(request, 2_000));
    await personLimit("mw-foto-reaksi", viewer.id, REACTIONS_PER_10_MINUTES);
    return success(await setReaction(viewer, id, input.emoji), "Reaksi terkirim.");
  });
}

/** DELETE: batal bereaksi. */
export function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await personLimit("mw-foto-reaksi", viewer.id, REACTIONS_PER_10_MINUTES);
    return success(await setReaction(viewer, id, null), "Reaksi dibatalkan.");
  });
}
