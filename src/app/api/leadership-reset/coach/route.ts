import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { handle, success } from "@/lib/server/http";
import { coachView } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** GET (coach key in the header): every answer, for the coach. */
export async function GET(request: Request) {
  return handle(async () => success(await coachView(request.headers.get(LEADERSHIP_RESET_KEY_HEADER)), ""));
}
