import { z } from "zod";
import { adminModuleKeys } from "@/lib/admin-modules";
import { getDisabledModules, setDisabledModules } from "@/lib/server/admin-settings";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.object({ disabled: z.array(z.enum(adminModuleKeys as [string, ...string[]])).max(adminModuleKeys.length) });

export async function GET() {
  return handle(async () => { await requireSuperAdmin(); return success(await getDisabledModules(), "Pengaturan modul dimuat."); });
}

/** Super admin only: which modules regular admins may use. Existing events keep their content. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { disabled } = validate(schema, await readJson(request, 5000));
    const saved = await setDisabledModules(disabled as (typeof adminModuleKeys)[number][]);
    return success({ disabled: saved }, saved.length ? `${saved.length} modul dinonaktifkan untuk admin biasa.` : "Semua modul tersedia untuk admin biasa.");
  });
}
