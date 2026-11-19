import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { newCoachKey } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** POST (CMS key in the header): a new link for the coach; the old one stops working. The key is shown once. */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    return success(await newCoachKey(request.headers.get(LEADERSHIP_RESET_KEY_HEADER)), "Tautan Coach baru dibuat. Tautan lama tidak berlaku lagi.");
  });
}
