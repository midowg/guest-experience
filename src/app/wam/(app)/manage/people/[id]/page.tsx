import { notFound } from "next/navigation";
import { BodProfileView } from "@/components/pra-wam/BodPeople";
import { roleLabels, roleSummary, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { bodProfile } from "@/lib/server/pra-wam/dashboard";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil peserta · WAM", robots: { index: false } };

/**
 * Profil peserta seen by BOD (Penpot "B2"): who they are, their department, BU and position, and
 * which Pra WAM forums they came to. Read only; nothing personal beyond what the event needs.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.person(id));
  if (!seesAllSessions(member)) notFound();
  const person = await bodProfile(member, id);
  if (!person) notFound();

  const viewerRole = member.roles.includes("bod") ? roleLabels.bod : member.roles.includes("admin") ? roleLabels.admin : roleLabels.panitia.toLowerCase();
  // The panitia stay in Kelola acara (its sidebar on a desktop); a BOD keeps the BOD frame.
  return <BodProfileView person={person} summary={roleSummary(person)} viewerRole={viewerRole} />;
}
