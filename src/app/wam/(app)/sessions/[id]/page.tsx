import { notFound } from "next/navigation";
import { SessionDetail, WaitingSession } from "@/components/pra-wam/SessionDetail";
import { praWamPath } from "@/lib/routes";
import { sessionView } from "@/lib/server/pra-wam/agenda";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sesi · WAM", robots: { index: false } };

/**
 * Detail sesi (Penpot P3) on its own page, for links from notifications, QR and Jadwal sesi: a
 * pushed screen (back bar, no bottom bar). Agenda and Beranda open the same content in a sheet
 * (AgendaSheet). Panitia, BOD and admin can open every session, drafts without a time too; a
 * participant whose session is not published (yet) or was cancelled gets a short page that says so
 * instead of "not found". Attendance may not be migrated yet; the page then has no QR check-in.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.session(id));
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const view = await sessionView(id, member);
  if (!view) notFound();
  if (view.kind === "menunggu") {
    return <>
      <WaitingSession session={view.session} />
    </>;
  }
  return <>
    <SessionDetail view={view} now={new Date()} />
  </>;
}
