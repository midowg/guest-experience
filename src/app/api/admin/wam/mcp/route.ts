import { z } from "zod";
import { MCP_SCOPES } from "@/lib/pra-wam/mcp";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { grantMcp, listMcpAccess } from "@/lib/server/pra-wam/mcp";

export const dynamic = "force-dynamic";

const grantSchema = z.object({
  employeeId: z.uuid("Pilih orangnya."),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1, "Pilih minimal satu cakupan.").max(MCP_SCOPES.length),
});

/** GET: who has MCP access, the last calls, and who could be added (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listMcpAccess(), "Akses MCP dimuat.");
  });
}

/** POST {employeeId, scopes}: give a WAM account MCP access (any admin). Answers with the fresh list. */
export async function POST(request: Request) {
  return handle(async () => {
    const role = await requireApiAdmin();
    checkOrigin(request);
    const { employeeId, scopes } = validate(grantSchema, await readJson(request, 2_000));
    await grantMcp(employeeId, scopes, role === "super" ? "super admin" : "admin");
    return success(await listMcpAccess(), "Akses MCP dibuka. BOD-nya membuat tautan sendiri di Pengaturan WAM → Akses MCP.");
  });
}
