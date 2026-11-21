import { z } from "zod";
import { officeSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteOffice, listOffices, saveOffice } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PUT: change an office point. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const input = validate(officeSchema, await readJson(request, 2_000));
    await saveOffice(input, id);
    return success(await listOffices(), `${input.name} disimpan.`);
  });
}

/** DELETE: remove an office point; old clock-ins keep its name. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteOffice(validate(z.uuid(), (await params).id));
    return success(await listOffices(), "Titik kantor dihapus.");
  });
}
