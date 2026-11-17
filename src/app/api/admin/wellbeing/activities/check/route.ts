import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkActivities, wellbeingActor } from "@/lib/server/wellbeing/admin";

export const dynamic = "force-dynamic";
const input = z.object({ ids: z.array(z.uuid()).min(1, "Pilih minimal satu aktivitas.").max(200, "Paling banyak 200 aktivitas sekaligus."), checked: z.boolean() });

/** POST: Periksa → Konfirmasi yang dipilih (checked: true), or its Urungkan (false). Points and decisions stay as they are. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const body = validate(input, await readJson(request, 12_000));
    const result = await checkActivities([...new Set(body.ids)], body.checked, await wellbeingActor());
    const count = result.changed.length;
    return success(result, body.checked ? (count ? `${count} aktivitas ditandai sudah diperiksa.` : "Semua yang dipilih sudah diperiksa.") : `${count} aktivitas dikembalikan ke belum diperiksa.`);
  });
}
