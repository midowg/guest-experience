import { settingsSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { holders } from "@/lib/server/coffee/people";
import { gaPinSet } from "@/lib/server/coffee/pin";
import { coffeeActor } from "@/lib/server/coffee/session";
import { drinkSettings, readSettings, saveSettings } from "@/lib/server/coffee/settings";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET: the monthly quotas and who holds the WG Coffee grant (changed in Super admin → Akses admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    const [settings, people, gaPin, drinks] = await Promise.all([readSettings(true), holders(), gaPinSet(), drinkSettings()]);
    // `gaPin`: whether a PIN GA is set. The PIN itself is never sent anywhere. `options`, `menu`: what drinks are asked with, and the drinks (F6).
    return success({ settings, holders: people, gaPin, ...drinks }, "");
  });
}

/** PUT {karyawan, ga, intern}: the monthly quotas; they hold from the next claim on. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(settingsSchema, await readJson(request, 1_000));
    const settings = await saveSettings(input, await coffeeActor());
    return success({ settings, holders: await holders(), gaPin: await gaPinSet(), ...(await drinkSettings()) }, "Jatah disimpan.");
  });
}
