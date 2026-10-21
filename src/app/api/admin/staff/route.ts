import { staffInputSchema } from "@/lib/validation";
import { createStaff, listStaff } from "@/lib/server/staff";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** GET: active team members for the PIC picker (any admin); ?semua=1 includes inactive ones (super admin). */
export async function GET(request: Request) {
  return handle(async () => {
    const all = new URL(request.url).searchParams.get("semua") === "1";
    if (all) await requireSuperAdmin(); else await requireApiAdmin();
    return success(await listStaff(!all), "Daftar tim dimuat.");
  });
}

/** POST: add a team member (super admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    return success(await createStaff(validate(staffInputSchema, await readJson(request, 20_000))), "Anggota tim ditambahkan.");
  });
}
