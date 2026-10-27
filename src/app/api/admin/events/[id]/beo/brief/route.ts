import { z } from "zod";
import { hostingBriefSchema } from "@/lib/hosting-brief";
import { saveBrief } from "@/lib/server/beo";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const inputSchema = z.object({ brief: hostingBriefSchema, version: z.number().int().min(0) });

/** PUT: save the hosting brief, refused when someone else saved it after this version. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const input = validate(inputSchema, await readJson(request, 20_000));
    return success(await saveBrief(id, input.brief, input.version), "Brief tamu tersimpan.");
  });
}
