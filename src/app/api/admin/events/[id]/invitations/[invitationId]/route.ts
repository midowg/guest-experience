import { z } from "zod";
import { manageInvitation } from "@/lib/server/invitations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; invitationId: string }> };
const name = z.string().trim().min(1, "Isi nama sapaan.").max(150);
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name }),
  z.object({ action: z.literal("update"), name, phone: z.string().regex(/^628\d{8,11}$/, "Gunakan nomor HP Indonesia.").nullable(), party_size_max: z.number().int().min(1).max(10) }),
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("rotate") }),
]);

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, invitationId } = await params;
    validate(z.uuid(), id); validate(z.uuid(), invitationId);
    const input = validate(updateSchema, await readJson(request, 2000));
    const details = input.action === "update" ? { name: input.name, phone: input.phone, party_size_max: input.party_size_max } : input.action === "rename" ? { name: input.name } : {};
    return success(await manageInvitation(id, input.action, invitationId, details), "Undangan diperbarui.");
  });
}
