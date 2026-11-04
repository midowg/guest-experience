import { notFound } from "next/navigation";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { SessionDetail, WaitingSession } from "@/components/pra-wam/SessionDetail";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { myAttendance, waitingSession } from "@/lib/server/pra-wam/agenda";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { myRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sesi · WAM", robots: { index: false } };

/**
 * Detail sesi (Penpot P3): a pushed screen (back bar, no bottom bar). Panitia, BOD and admin can
 * open every session, drafts without a time too; a participant whose session is not published
 * (yet) or was cancelled gets a short page that says so instead of "not found". Attendance may
 * not be migrated yet; the page then simply has no QR check-in.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.session(id));
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) {
    const waiting = await waitingSession(id, member);
    if (!waiting) notFound();
    return <PraWamShell member={member} current="agenda" back={{ href: praWamPath.agenda, title: "Detail sesi" }}>
      <WaitingSession session={waiting} />
    </PraWamShell>;
  }
  const [{ documents, storage }, attendance, requests, rooms] = await Promise.all([
    listDocuments(member, session.id).catch(() => ({ documents: [], migrated: false, storage: false })),
    session.isParticipant ? myAttendance(session.id, member) : Promise.resolve({ ready: false, checkedInAt: null }),
    session.isParticipant ? myRequests(session.id, member) : Promise.resolve([]),
    listRooms(),
  ]);
  const staff = seesAllSessions(member);
  // Panitia and BOD reach a session they do not attend from Jadwal sesi; everyone else from their agenda.
  const fromSchedule = staff && !session.isParticipant;
  return <PraWamShell member={member} current={fromSchedule ? "sesi" : "agenda"} back={{ href: fromSchedule ? praWamPath.sessions : praWamPath.agenda, title: "Detail sesi" }}>
    <SessionDetail session={session} documents={documents} storage={storage} attendance={attendance} requests={requests} rooms={rooms}
      viewer={{ name: member.name, manage: managesSessions(member), staff }} now={new Date()} />
  </PraWamShell>;
}
