import { z } from "zod";
import { reportSchema } from "@/lib/main-wam/momen/filters";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { reportPhoto, unhideReported } from "@/lib/server/main-wam/momen/feed";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * POST {reason, note}: Laporkan foto (M04). Hidden for the reporter at once; at the third reporter
 * hidden for everyone until panitia decide. Ten reports per person per 10 minutes.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireMainWamApi();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const input = validate(reportSchema, await readJson(request, 2_000));
    return success(await reportPhoto(context, id, input), "Laporan terkirim. Terima kasih.");
  });
}

/** DELETE: "Tampilkan lagi", for the reporter only (the report stays for panitia). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await unhideReported(viewer, id);
    return success({ id }, "Foto ditampilkan lagi.");
  });
}
