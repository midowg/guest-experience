import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiHrAdmin, setHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** PUT {on}: gives or takes one person's Admin HR (Admin HR only). */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiHrAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const { on } = validate(z.object({ on: z.boolean() }), await readJson(request, 200));
    await setHrAdmin(employeeId, on, member);
    return success(null, on ? "Admin HR ditambahkan." : "Akses Admin HR dicabut.");
  });
}
