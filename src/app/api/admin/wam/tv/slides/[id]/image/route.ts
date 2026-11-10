import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { handle, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { slideImage } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ id: z.uuid() });

/** GET: one TV picture for the admin's list and preview, hidden ones included. A picture never changes under its id. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const { id } = validate(schema, await params);
    const image = await slideImage(id, false);
    if (!image) throw new ServiceError(404, "Gambar tidak ditemukan.");
    return new Response(Buffer.from(image.bytes), {
      headers: { "Content-Type": image.type, "Content-Length": String(image.bytes.byteLength), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
