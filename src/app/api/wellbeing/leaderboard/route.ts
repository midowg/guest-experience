import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { BOARD_DIMENSIONS, BOARD_PERIODS, leaderboard } from "@/lib/server/wellbeing/member";

export const dynamic = "force-dynamic";
const query = z.object({
  period: z.enum(BOARD_PERIODS).default("month"),
  dim: z.enum(BOARD_DIMENSIONS).default("all"),
});

/** GET: Peringkat (?period=month|all, ?dim=all|<dimension>): the top 30, my place, and last month's champion. */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    const input = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    return success(await leaderboard(member, input.period, input.dim), "Peringkat dimuat.");
  });
}
