import { z } from "zod";
import { awardCategorySchema } from "@/lib/main-wam/modul/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteCategory, updateCategory } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Kategori tidak dikenali."), (await params).id);

/** PATCH: the category's settings (name, how it is decided, window, announcement, session, published). */
export async function PATCH(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(awardCategorySchema, await readJson(request, 5_000));
    const category = await updateCategory(await idOf(context), input);
    return success(category, category.published ? "Kategori tersimpan dan terbit." : "Kategori tersimpan.");
  });
}

/** DELETE: a category without votes. */
export async function DELETE(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteCategory(await idOf(context));
    return success(null, "Kategori dihapus.");
  });
}
