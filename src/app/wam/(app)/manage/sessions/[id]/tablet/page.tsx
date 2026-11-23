import { notFound } from "next/navigation";
import { FaceTablet } from "@/components/pra-wam/FaceTablet";
import { Notice } from "@/components/ui";
import { managesSessions } from "@/lib/pra-wam/roles";
import { sessionWhen } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { kioskOverview } from "@/lib/server/pra-wam/face-kiosk";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mode tablet · WAM", robots: { index: false } };

/** Mode tablet (23 Nov 2026): panitia's tablet at the door recognises participants' faces. */
export default async function FaceTabletPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.sessionFaceTablet(id));
  if (!managesSessions(member) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) notFound();
  if (session.booking?.outside) return <Notice tone="info">Booking ini untuk keperluan di luar WAM, jadi tidak perlu absen.</Notice>;
  const overview = await kioskOverview(id, member).catch((error: unknown) => { if (error instanceof ServiceError) return error.message; throw error; });
  if (typeof overview === "string") return <Notice tone="warning">{overview}</Notice>;
  return <FaceTablet sessionId={session.id} title={session.title} when={sessionWhen(session)} overview={overview} backHref={praWamPath.sessionAttendance(session.id)} />;
}
