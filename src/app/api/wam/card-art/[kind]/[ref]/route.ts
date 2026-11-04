import { z } from "zod";
import { artKinds } from "@/lib/pra-wam/cards";
import { adminRole } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { handle, validate } from "@/lib/server/http";
import { artBytes } from "@/lib/server/pra-wam/cards";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ kind: string; ref: string }> };
const schema = z.object({ kind: z.enum(artKinds), ref: z.string().regex(/^([0-9a-f-]{36}|[0-9]{1,2})$/) });

/**
 * GET: one picture of the card catalog, for a signed-in member or an admin. The bytes come
 * through this site (not a storage redirect), so the app may draw them on a canvas and save the
 * card. With `v` (the picture's version) the browser keeps it; a new picture has a new `v`.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    if (!(await currentMember().catch(() => null)) && !(await adminRole())) throw new ServiceError(401, "Masuk dulu untuk melihat kartu.");
    const { kind, ref } = validate(schema, await params);
    const form = await currentForm();
    const art = form ? await artBytes(form.id, kind, ref) : null;
    if (!art) throw new ServiceError(404, "Gambar belum ada.");
    const versioned = new URL(request.url).searchParams.has("v");
    return new Response(Buffer.from(art.bytes), {
      headers: {
        "Content-Type": art.type, "Content-Length": String(art.bytes.byteLength), "X-Content-Type-Options": "nosniff",
        "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
      },
    });
  });
}
