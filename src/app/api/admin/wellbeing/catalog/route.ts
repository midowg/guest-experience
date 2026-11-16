import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { catalog, createCatalogItem } from "@/lib/server/wellbeing/admin";
import { catalogItemSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** GET: the activity catalogue (daily activities and sports). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await catalog(), "Katalog dimuat.");
  });
}

/** POST: a new kind of activity. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(catalogItemSchema, await readJson(request, 4_000));
    return success(await createCatalogItem(input), "Jenis kegiatan ditambahkan.");
  });
}
