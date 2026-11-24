import { decodeTaggedCursor, type TaggedAnswer } from "@/lib/main-wam/momen/tagged";
import { ServiceError } from "@/lib/server/config";
import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { listTagged } from "@/lib/server/main-wam/momen/tagged";

export const dynamic = "force-dynamic";

/**
 * GET ?sebelum=<cursor "t~…">: one page (30) of the photos others tagged the person in (Galeri, tab Ditandai), newest first.
 * Only photos the person may see (shown, past their 5 seconds, not reported by them); the first page also carries the total.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const context = await requireMainWamApi();
    const cursor = decodeTaggedCursor(new URL(request.url).searchParams.get("sebelum"));
    if (cursor === false) throw new ServiceError(422, "Daftar foto tidak dikenali. Muat ulang halaman.");
    return success<TaggedAnswer>(await listTagged(context, { cursor }), "Foto dimuat.");
  });
}
