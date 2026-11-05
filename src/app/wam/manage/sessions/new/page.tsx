import { notFound } from "next/navigation";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { SessionForm } from "@/components/pra-wam/SessionForm";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { sessionFormData } from "@/lib/server/pra-wam/session-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat sesi · WAM", robots: { index: false } };

export default async function NewSessionPage() {
  const member = await requireMemberPage(praWamPath.newSession);
  if (!managesSessions(member)) notFound();
  const data = await sessionFormData(null, member.id);
  return <PraWamShell member={member} current="sesi" back={{ href: praWamPath.sessions, title: "Buat sesi" }}><SessionForm session={null} {...data} viewerId={member.id} /></PraWamShell>;
}
