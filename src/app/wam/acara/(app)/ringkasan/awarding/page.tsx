import { AwardApproval } from "@/components/main-wam/modul/bod/AwardApproval";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import { closedCounts } from "@/lib/main-wam/modul/awards";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { approverNames, awardsShown, nomineeViews, voteCounts } from "@/lib/server/main-wam/modul/awards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Persetujuan awarding · WAM", robots: { index: false } };

/** B06 Persetujuan awarding: BOD only, module Voting Awarding. Counts per nominee only once voting closed, never who voted. */
export default async function AwardApprovalPage() {
  const { viewer } = await requireActionPage("awarding-setujui", mainWamPath.awardApproval);
  const now = new Date();
  const [{ categories, approvals, migrated }, counts] = await Promise.all([awardsShown(), voteCounts()]);
  if (!migrated) return <Waiting />;
  const [{ nominees }, names] = await Promise.all([nomineeViews(categories), approverNames(approvals.values())]);
  return <AwardApproval now={now.toISOString()} data={{
    categories, me: viewer.id, counts: closedCounts(categories, counts, now),
    nominees: Object.fromEntries(nominees), approvals: Object.fromEntries(approvals), names: Object.fromEntries(names),
  }} />;
}
