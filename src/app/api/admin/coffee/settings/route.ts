import { settingsSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { holders } from "@/lib/server/coffee/people";
import { coffeeActor } from "@/lib/server/coffee/session";
import { readSettings, saveSettings } from "@/lib/server/coffee/settings";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET: the monthly quotas and who holds the Werkudara Coffee grant (changed in Super admin → Akses admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    const [settings, people] = await Promise.all([readSettings(true), holders()]);
    return success({ settings, holders: people }, "");
  });
}

/** PUT {karyawan, ga, intern}: the monthly quotas; they hold from the next claim on. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(settingsSchema, await readJson(request, 1_000));
    const settings = await saveSettings(input, await coffeeActor());
    return success({ settings, holders: await holders() }, "Jatah disimpan.");
  });
}
