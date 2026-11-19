import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HOME_STYLES, homeStyleLabels } from "@/lib/home-style";
import { homeMenuSchema } from "@/lib/home-menu";
import { getHomeMenu, getHomeStyle, setHomeMenu, setHomeStyle } from "@/lib/server/admin-settings";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.union([z.object({ style: z.enum(HOME_STYLES) }), z.object({ menu: homeMenuSchema })]);

export async function GET() {
  return handle(async () => {
    await requireSuperAdmin();
    const [style, menu] = await Promise.all([getHomeStyle(), getHomeMenu()]);
    return success({ ...style, menu: menu.menu, menuMigrated: menu.migrated }, "Pengaturan halaman utama dimuat.");
  });
}

/** Super admin only: the front page's look ({ style }) or its app menu ({ menu }). The front page shows it at once. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const body = validate(schema, await readJson(request, 20_000));
    if ("style" in body) {
      const saved = await setHomeStyle(body.style);
      revalidatePath("/");
      return success({ style: saved }, `Halaman utama sekarang memakai tampilan ${homeStyleLabels[saved].name}.`);
    }
    const menu = await setHomeMenu(body.menu);
    revalidatePath("/");
    const shown = menu.filter(item => item.shown).length;
    return success({ menu }, `Menu disimpan: ${shown} aplikasi tampil di halaman utama.`);
  });
}
