import { officeSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { listOffices, saveOffice } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";

/** GET: the office points. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listOffices(), "");
  });
}

/** POST {name, lat, lng, radiusM, zone, active}: a new office point. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(officeSchema, await readJson(request, 2_000));
    await saveOffice(input);
    return success(await listOffices(), `${input.name} ditambahkan.`);
  });
}
