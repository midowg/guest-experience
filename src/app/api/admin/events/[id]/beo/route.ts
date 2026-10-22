import { z } from "zod";
import { beoSummary } from "@/lib/beo";
import { applyBeo } from "@/lib/server/beo";
import { readAdminEvent } from "@/lib/server/events";
import { listAllRsvps } from "@/lib/server/responses";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();
const inputSchema = z.object({
  action: z.enum(["save", "set", "revise", "final", "done", "reopen"]),
  version: z.number().int().min(0),
  prepared_count: z.number().int().min(0).max(100000).nullable(),
  notes: z.string().max(4000).optional(),
  reason: z.string().trim().max(500).optional(),
}).refine(input => input.action !== "revise" || !!input.reason, { path: ["reason"], message: "Tulis alasan revisi." });

/** PUT: one step of the BEO flow. The attending count is read here, not trusted from the browser. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    const role = await requireEventAccess(id);
    const input = validate(inputSchema, await readJson(request, 10_000));
    const event = await readAdminEvent(id);
    if (!event) throw new ServiceError(404, "Acara tidak ditemukan.");
    const { attending } = beoSummary(event, await listAllRsvps(id));
    const state = await applyBeo(id, input, attending, role);
    return success(state, input.action === "save" ? "Draf BEO tersimpan." : "Status BEO diperbarui.");
  });
}
