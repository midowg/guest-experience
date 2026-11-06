import { z } from "zod";
import { MCP_SCOPES } from "@/lib/pra-wam/mcp";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { grantMcp, listMcpAccess, restoreMcp, revokeMcp } from "@/lib/server/pra-wam/mcp";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

const changeSchema = z.union([
  z.object({ action: z.enum(["cabut", "pulihkan"]) }),
  z.object({ scopes: z.array(z.enum(MCP_SCOPES)).min(1, "Pilih minimal satu cakupan.").max(MCP_SCOPES.length) }),
]);

/** PATCH {action: "cabut" | "pulihkan"} or {scopes}: one person's MCP access (any admin). Answers with the fresh list. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const role = await requireApiAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const change = validate(changeSchema, await readJson(request, 2_000));
    const by = role === "super" ? "super admin" : "admin";
    let message = "Cakupan MCP disimpan.";
    if ("action" in change) {
      if (change.action === "cabut") { await revokeMcp(employeeId); message = "Akses MCP dicabut. Tautannya langsung tidak berlaku."; }
      else { await restoreMcp(employeeId, by); message = "Akses MCP dipulihkan. Orangnya perlu membuat tautan baru di Profil."; }
    } else {
      await grantMcp(employeeId, change.scopes, by);
    }
    return success(await listMcpAccess(), message);
  });
}
