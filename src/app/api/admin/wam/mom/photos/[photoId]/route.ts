import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, validate } from "@/lib/server/http";
import { cabinetPhotoAddress, cabinetPhotoFile } from "@/lib/server/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ photoId: string }> };
const filename = z.string().regex(/^[\w .()-]{1,120}\.jpg$/i, "Nama berkas tidak dikenali.");

/**
 * GET: a photo of a sent MoM for Arsip MoM (any admin): to its storage address (?unduh=<name>.jpg
 * downloads it under that name), or with ?berkas=1 its bytes, for a zip made in the browser.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(z.uuid(), (await params).photoId);
    const query = new URL(request.url).searchParams;
    if (query.get("berkas") === "1") {
      const bytes = await cabinetPhotoFile(id);
      return new Response(bytes as BodyInit, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
    }
    const name = query.get("unduh");
    const address = await cabinetPhotoAddress(id, name ? validate(filename, name) : undefined);
    return new Response(null, { status: 302, headers: { Location: address, "Cache-Control": "private, no-store" } });
  });
}
