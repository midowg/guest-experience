import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { newCmsKey } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** POST (CMS key in the header): a new CMS link; the one in use stops working at once. */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    return success(await newCmsKey(request.headers.get(LEADERSHIP_RESET_KEY_HEADER)), "Tautan CMS baru dibuat. Simpan sekarang: tautan lama tidak berlaku lagi.");
  });
}
