import { aboutInputSchema } from "@/lib/pra-wam/about";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { getAbout, resetAbout, saveAbout } from "@/lib/server/pra-wam/about";

export const dynamic = "force-dynamic";

/** PUT: the "Apa itu WAM?" text on Beranda (super admin). Plain text; cleaned, then checked. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    await saveAbout(validate(aboutInputSchema, await readJson(request, 20_000)));
    return success(await getAbout(), "Apa itu WAM disimpan.");
  });
}

/** DELETE: back to the default text (super admin). */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    await resetAbout();
    return success(await getAbout(), "Apa itu WAM kembali ke teks bawaan.");
  });
}
