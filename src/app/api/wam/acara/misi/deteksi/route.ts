import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { setAutoSwitch } from "@/lib/server/main-wam/misi/deteksi";
import { readAutoPref } from "@/lib/server/main-wam/misi/deteksi-store";

export const dynamic = "force-dynamic";

/** GET: my switch "Deteksi misi otomatis" (`saved` false until the migration has run: then the app only suggests). */
export async function GET() {
  return handle(async () => {
    const context = await requireActionApi("misi");
    const pref = await readAutoPref(context.viewer.id);
    return success({ on: pref.on, saved: pref.stored }, "");
  });
}

/** PUT {on}: turn the switch on or off. Off: a photo that meets a mission is only suggested, never sent by itself. */
export async function PUT(request: Request) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const { on } = validate(z.object({ on: z.boolean("Pilih aktif atau mati.") }).strict(), await readJson(request, 200));
    return success(await setAutoSwitch(context, on), on ? "Deteksi misi otomatis aktif." : "Deteksi misi otomatis mati. Foto yang cocok hanya disarankan.");
  });
}
