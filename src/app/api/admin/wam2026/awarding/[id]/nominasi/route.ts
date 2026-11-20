import { z } from "zod";
import { nomineesSchema } from "@/lib/main-wam/modul/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { setNominees } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PUT {nominees}: the whole list of nominees in order (people, Momen photos, or names). */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Kategori tidak dikenali."), (await params).id);
    const { nominees } = validate(nomineesSchema, await readJson(request, 40_000));
    return success(await setNominees(id, nominees), "Nominasi tersimpan.");
  });
}
