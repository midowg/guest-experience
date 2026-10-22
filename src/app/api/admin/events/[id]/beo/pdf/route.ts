import { z } from "zod";
import { beoDocument, beoFileName, beoVersionFromParam } from "@/lib/beo-document";
import { loadBeo } from "@/lib/server/beo";
import { beoPdf } from "@/lib/server/beo-pdf";
import { ServiceError } from "@/lib/server/config";
import { handle, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** GET ?versi=penyedia|internal: the BEO as a PDF download. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const data = await loadBeo(id);
    if (!data) throw new ServiceError(404, "Acara tidak ditemukan.");
    const version = beoVersionFromParam(new URL(request.url).searchParams.get("versi"));
    const bytes = await beoPdf(beoDocument(data.event, data.summary, data.state, data.revisions, version));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${beoFileName(data.event.slug, version, data.state)}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
