import { z } from "zod";
import { importInvitations, listInvitations, manageInvitation } from "@/lib/server/invitations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { MAX_IMPORT } from "@/lib/guest-import";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idSchema = z.uuid();
// Phones arrive already normalised by the client (628…); the database checks the same pattern.
const guest = z.object({
  name: z.string().trim().min(1, "Isi nama sapaan.").max(150),
  phone: z.string().regex(/^628\d{8,11}$/, "Gunakan nomor HP Indonesia.").nullable().default(null),
  party_size_max: z.number().int().min(1).max(10).default(1),
});
const bodySchema = z.union([z.object({ rows: z.array(guest).min(1).max(MAX_IMPORT, `Impor maksimal ${MAX_IMPORT} tamu sekaligus.`) }), guest]);

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => { await requireApiAdmin(); return success(await listInvitations(validate(idSchema, (await params).id)), "Undangan dimuat."); });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    const input = validate(bodySchema, await readJson(request, 200_000));
    if ("rows" in input) {
      const created = await importInvitations(id, input.rows);
      return success(created, `${created.length} tamu diimpor.`);
    }
    return success(await manageInvitation(id, "create", undefined, input), "Undangan tamu dibuat.");
  });
}
