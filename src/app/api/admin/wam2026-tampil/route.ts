import { z } from "zod";
import { currentAdmin, requireSuperAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { getMainWamVisibility, setMainWamShown } from "@/lib/server/main-wam-visibility";

export const dynamic = "force-dynamic";
const schema = z.object({ shown: z.boolean() }).strict();

/** GET: whether Main WAM shows in Journey (super admin). */
export async function GET() {
  return handle(async () => {
    await requireSuperAdmin();
    return success(await getMainWamVisibility(), "");
  });
}

/**
 * PUT { shown }: the super admin shows Main WAM in Journey (Admin WAM's menu, /wam → Main WAM by its mode,
 * notes to everyone it is on for), or hides it again. Recorded with who and when.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { shown } = validate(schema, await readJson(request, 500));
    const actor = await currentAdmin();
    const saved = await setMainWamShown(shown, actor?.name ?? "Super admin");
    return success(saved, saved.shown ? "WAM 2026 ditampilkan di aplikasi." : "WAM 2026 disembunyikan lagi dari aplikasi.");
  });
}
