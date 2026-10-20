import { z } from "zod";
import { listInvitations, manageInvitation } from "@/lib/server/invitations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idSchema = z.uuid();
const createSchema = z.object({ name: z.string().trim().min(1).max(150) });

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => { await requireApiAdmin(); return success(await listInvitations(validate(idSchema, (await params).id)), "Undangan dimuat."); });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    const { name } = validate(createSchema, await readJson(request, 2000));
    return success(await manageInvitation(id, "create", undefined, name), "Undangan tamu dibuat.");
  });
}
