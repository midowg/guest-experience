import { mainWamCan } from "@/lib/main-wam/access";
import { closedTally, voteCard } from "@/lib/main-wam/modul/awards";
import { handle, success } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { awardsShown, myVotes, nomineeViews, voteCounts } from "@/lib/server/main-wam/modul/awards";

export const dynamic = "force-dynamic";

/**
 * GET: the categories (published, not computed) with their nominees and this person's own votes.
 * Counts only for the BOD (aggregates, no voters), and only once voting closed (audit M1); never a
 * running count to anyone. A winner
 * shows to everyone once approved and announced.
 */
export async function GET() {
  return handle(async () => {
    const { viewer } = await requireModuleApi("voting");
    const now = new Date();
    const [{ categories, approvals, migrated }, mine] = await Promise.all([awardsShown(), myVotes(viewer.id)]);
    const { nominees } = await nomineeViews(categories);
    const bod = mainWamCan(viewer, "awarding-setujui");
    const counts = bod ? await voteCounts() : null;
    return success({
      migrated,
      categories: categories.map(category => {
        const card = voteCard(category, mine.has(category.id), approvals.get(category.id), now);
        return {
          id: category.id, title: category.title, description: category.description, method: category.method, opensAt: category.opensAt, closesAt: category.closesAt,
          announceAt: category.announceAt, card, myVote: mine.get(category.id) ?? null,
          nominees: category.nominees.map(nominee => nominees.get(nominee.id)).filter(Boolean),
          ...(card.kind === "diumumkan" ? { winner: nominees.get(card.nomineeId) ?? null } : {}),
          ...(counts ? { tally: closedTally(category, counts.get(category.id), now)?.rows ?? null, approval: approvals.get(category.id) ?? null } : {}),
        };
      }),
    }, "");
  });
}
