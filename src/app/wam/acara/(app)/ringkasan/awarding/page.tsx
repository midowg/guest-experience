import { AwardApproval } from "@/components/main-wam/modul/bod/AwardApproval";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { approverNames, awardsShown, nomineeViews, voteCounts } from "@/lib/server/main-wam/modul/awards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Persetujuan awarding · WAM", robots: { index: false } };

/** B06 Persetujuan awarding: BOD only, module Voting Awarding. Counts per nominee only, never who voted. */
export default async function AwardApprovalPage() {
  const { viewer } = await requireActionPage("awarding-setujui", mainWamPath.awardApproval);
  const [{ categories, approvals, migrated }, counts] = await Promise.all([awardsShown(), voteCounts()]);
  if (!migrated) return <Waiting />;
  const [{ nominees }, names] = await Promise.all([nomineeViews(categories), approverNames(approvals.values())]);
  return <AwardApproval now={new Date().toISOString()} data={{
    categories, me: viewer.id,
    counts: Object.fromEntries([...counts].map(([id, map]) => [id, Object.fromEntries(map)])),
    nominees: Object.fromEntries(nominees), approvals: Object.fromEntries(approvals), names: Object.fromEntries(names),
  }} />;
}
