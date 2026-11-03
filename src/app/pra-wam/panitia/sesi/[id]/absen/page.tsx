import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AttendancePanel } from "@/components/pra-wam/AttendancePanel";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ButtonLink, Notice } from "@/components/ui";
import { checkInWindow } from "@/lib/pra-wam/attendance";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { absolute, praWamApi, praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { attendance, qrToken } from "@/lib/server/pra-wam/attendance";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen sesi · Pra WAM", robots: { index: false } };

/** Panitia: the session's static QR to print, and who is present. BOD reads the list. */
export default async function SessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.sessionAttendance(id));
  if (!seesAllSessions(member) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) notFound();
  const manage = managesSessions(member);
  const loaded = await Promise.all([attendance(id, member), manage ? qrToken(id, member) : Promise.resolve(null)]).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  if (typeof loaded === "string") return <PraWamShell member={member} current="sesi"><Notice tone="warning">{loaded}</Notice></PraWamShell>;
  const [rows, token] = loaded;
  const host = (await headers()).get("host");
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${host?.startsWith("localhost") ? "http" : "https"}://${host}`;
  const qrSvg = token ? await QRCode.toString(absolute(origin, praWamPath.checkIn(token)), { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
  const window = session.startsAt && session.endsAt ? checkInWindow(session.startsAt, session.endsAt) : null;
  return <PraWamShell member={member} current="sesi">
    <div className={styles.head}>
      <div><p className={styles.kicker}>Absen · {sessionWhen(session)} · {sessionWhere(session)}</p><h1>{session.title}</h1></div>
      {manage && <ButtonLink variant="secondary" href={praWamPath.editSession(session.id)}>Ubah sesi</ButtonLink>}
    </div>
    {session.status !== "terbit" && <Notice tone="info">Sesi belum terbit. QR baru mencatat kehadiran setelah sesi diterbitkan.</Notice>}
    {qrSvg && <section className={styles.card} aria-labelledby="qr">
      <h2 id="qr">QR absen</h2>
      <div className={styles.qrBox} dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <p className={styles.hint}>QR ini tetap sama walau jam atau ruang sesi berubah. {window ? `Absen dibuka ${clockLabel(wibTime(window.opens))} sampai ${clockLabel(wibTime(window.closes))} WIB.` : "Jendela absen mengikuti jam sesi."}</p>
      <div className={styles.actions}><a className="button button--primary" href={praWamApi.sessionQr(session.id)} target="_blank" rel="noopener">Cetak QR (PDF A5)</a></div>
    </section>}
    <section className={styles.card} aria-labelledby="hadir">
      <h2 id="hadir">Daftar hadir</h2>
      <AttendancePanel sessionId={session.id} initial={rows} canEdit={manage} />
    </section>
  </PraWamShell>;
}
