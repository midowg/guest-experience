import { z } from "zod";
import { currentAdmin, requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { addTester, listTesters } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
const schema = z.object({ employeeId: z.uuid("Pilih karyawan.") });

/** POST {employeeId}: one more penguji (sees Main WAM in mode uji, and by its address in mode pra), beside Panitia WAM. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { employeeId } = validate(schema, await readJson(request, 1_000));
    const actor = await currentAdmin();
    await addTester(employeeId, actor?.name ?? (actor?.role === "super" ? "Super admin" : "Admin"));
    return success(await listTesters(), "Penguji ditambahkan.");
  });
}
