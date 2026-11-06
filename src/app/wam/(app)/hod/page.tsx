import { redirect } from "next/navigation";
import { HodBoard } from "@/components/pra-wam/HodBoard";
import { praWamPath } from "@/lib/routes";
import { hodDepartments, hodStanding, listHodMeetings } from "@/lib/server/pra-wam/hod";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meeting HOD · WAM", robots: { index: false } };

/** Meeting HOD (6 Nov 2026): meetings between department heads. Only a HOD may open it. */
export default async function HodPage() {
  const member = await requireMemberPage(praWamPath.hod);
  const standing = await hodStanding(member);
  if (!standing.isHod) redirect(praWamPath.home);
  const [{ meetings, migrated }, departments] = await Promise.all([listHodMeetings(), hodDepartments().catch(() => [])]);
  return <HodBoard meetings={meetings} departments={departments} viewerId={member.id} ownUnits={standing.unitIds} migrated={migrated} now={new Date().toISOString()} />;
}
