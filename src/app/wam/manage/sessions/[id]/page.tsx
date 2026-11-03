import { notFound } from "next/navigation";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { SessionForm } from "@/components/pra-wam/SessionForm";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";
import { sessionFormData } from "@/lib/server/pra-wam/session-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ubah sesi · WAM", robots: { index: false } };

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.editSession(id));
  if (!managesSessions(member) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) notFound();
  const data = await sessionFormData(session, member.id);
  return <PraWamShell member={member} current="sesi"><SessionForm session={session} {...data} /></PraWamShell>;
}
