import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HOME_STYLES, homeStyleLabels } from "@/lib/home-style";
import { getHomeStyle, setHomeStyle } from "@/lib/server/admin-settings";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.object({ style: z.enum(HOME_STYLES) });

export async function GET() {
  return handle(async () => { await requireSuperAdmin(); return success(await getHomeStyle(), "Tampilan halaman utama dimuat."); });
}

/** Super admin only: the front page's look. The front page shows it at once. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { style } = validate(schema, await readJson(request, 1000));
    const saved = await setHomeStyle(style);
    revalidatePath("/");
    return success({ style: saved }, `Halaman utama sekarang memakai tampilan ${homeStyleLabels[saved].name}.`);
  });
}
