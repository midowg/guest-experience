import { z } from "zod";
import { positionSchema } from "@/lib/main-wam/misi/schema";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { checkIn } from "@/lib/server/main-wam/misi/actions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const body = z.object({ position: positionSchema }).strict();

/** POST {position}: check in to a check-in mission. The server judges the position; points follow at once (or after review). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const input = validate(body, await readJson(request, 2_000));
    const completion = await checkIn(context, id, input.position);
    return success({ status: completion.status }, completion.status === "disetujui" ? "Misi selesai." : "Foto terkirim. Menunggu persetujuan.");
  });
}
