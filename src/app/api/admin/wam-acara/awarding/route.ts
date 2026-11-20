import { awardCategorySchema } from "@/lib/main-wam/modul/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminAwards, createCategory } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";

/** GET: categories, nominees, counts per nominee (no voters), approvals; for Admin WAM 2027 → Awarding. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminAwards(), "");
  });
}

/** POST: a new category (saved unpublished; nominees come next). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(awardCategorySchema, await readJson(request, 5_000));
    return success(await createCategory(input), "Kategori dibuat. Tambahkan nominasinya.");
  });
}
