import { guideInputSchema } from "@/lib/main-wam/admin/guides";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { createGuide } from "@/lib/server/main-wam/admin/guides";

export const dynamic = "force-dynamic";

/** POST a guide (Denah, Hotel & fasilitas, Dress code, Tata tertib, …); its file is uploaded after. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(guideInputSchema, await readJson(request, 40_000));
    return success(await createGuide(input), `${input.title} ditambahkan.`);
  });
}
