import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { handle, success } from "@/lib/server/http";
import { cmsView } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** GET (CMS key in the header): the form, its state, the coach link's state, and who answered (never what). */
export async function GET(request: Request) {
  return handle(async () => success(await cmsView(request.headers.get(LEADERSHIP_RESET_KEY_HEADER)), ""));
}
