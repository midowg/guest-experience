import { mcpMethodNotAllowed, mcpPost } from "@/lib/server/pra-wam/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ key: string }> };

/**
 * MCP WAM with the key in the address: claude.ai custom connectors and ChatGPT connectors cannot
 * send a fixed header, so the whole URL is the secret. Same handler as /api/mcp.
 */
export async function POST(request: Request, { params }: Params) {
  return mcpPost(request, (await params).key);
}
export const GET = mcpMethodNotAllowed;
export const DELETE = mcpMethodNotAllowed;
