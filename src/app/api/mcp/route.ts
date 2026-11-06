import { mcpMethodNotAllowed, mcpPost } from "@/lib/server/pra-wam/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP WAM over Streamable HTTP, stateless, JSON answers: the key in `Authorization: Bearer <key>`
 * (Claude Code, Claude Desktop config). Read only; see src/lib/server/pra-wam/mcp.ts.
 */
export async function POST(request: Request) {
  return mcpPost(request, null);
}
export const GET = mcpMethodNotAllowed;
export const DELETE = mcpMethodNotAllowed;
