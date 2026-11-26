import { notFound } from "next/navigation";
import { CheckIn } from "@/components/main-wam/modul/absen/CheckIn";
import { isQrToken } from "@/lib/main-wam/modul/absen";
import { mainWamPath } from "@/lib/routes";
import { requireQrAbsenPage } from "@/lib/server/main-wam/gate";
import { sessionByQr } from "@/lib/server/main-wam/modul/absen";
import { panitiaContact } from "@/lib/server/main-wam/modul/contact";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen · WAM", robots: { index: false } };

/**
 * What a session's printed QR holds (404 while QR_ABSEN_VISIBLE is false, KONTRAK 41) (A02 tercatat, A03 belum dibuka, A04 sudah ditutup). Not signed
 * in: the gate sends the person to sign in and back here. The check-in itself is a POST from the
 * screen, never this page load.
 */
export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { settings } = await requireQrAbsenPage(mainWamPath.checkIn(token));
  if (!isQrToken(token)) notFound();
  const session = await sessionByQr(token).catch(() => null);
  const contact = await panitiaContact(settings, session).catch(() => null);
  return <CheckIn token={token} contact={contact} />;
}
