import { mayUseMcp } from "@/lib/pra-wam/mcp";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, success } from "@/lib/server/http";
import { rotateKey } from "@/lib/server/pra-wam/mcp";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/**
 * POST: a new MCP link for the signed-in person (only with access from Admin WAM). The old link
 * stops working. The full link is in this answer only; the server keeps its hash.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    if (!mayUseMcp(member)) throw new ServiceError(403, "Akses MCP hanya untuk BOD.");
    await enforceRateLimit(request, "pra-wam-mcp-key", 10);
    const key = await rotateKey(member.id);
    return success({ url: `${new URL(request.url).origin}/api/mcp/${key}` }, "Tautan MCP baru dibuat. Tautan lama tidak berlaku lagi.");
  });
}
