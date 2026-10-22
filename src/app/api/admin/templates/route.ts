import { z } from "zod";
import { templateKeys } from "@/lib/event-templates";
import { getEnabledTemplates, setEnabledTemplates } from "@/lib/server/admin-settings";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.object({ enabled: z.array(z.enum(templateKeys)).max(templateKeys.length) });

export async function GET() {
  return handle(async () => { await requireSuperAdmin(); return success(await getEnabledTemplates(), "Pengaturan templat dimuat."); });
}

/** Super admin only: which templates regular admins see in "Buat acara". */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { enabled } = validate(schema, await readJson(request, 5000));
    const saved = await setEnabledTemplates(enabled);
    return success({ enabled: saved }, saved.length ? `${saved.length} templat tersedia untuk admin biasa.` : "Tidak ada templat untuk admin biasa; mereka hanya bisa menyalin acara.");
  });
}
