import { z } from "zod";
import { artStartSchema } from "@/lib/pra-wam/cards";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmArtUpload } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";
const schema = artStartSchema.and(z.object({ key: z.string().max(200), token: z.string().max(200) }));

/** POST: the picture is uploaded; check its size and kind, then it fills its slot (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await confirmArtUpload(validate(schema, await readJson(request, 2_000)));
    return success({ saved: true }, "Gambar disimpan.");
  });
}
