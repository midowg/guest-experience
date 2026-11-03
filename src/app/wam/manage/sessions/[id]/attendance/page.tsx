import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ChevronLeft, FileText, Info } from "lucide-react";
import { AttendancePanel } from "@/components/pra-wam/AttendancePanel";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
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
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "QR absen · WAM", robots: { index: false } };

/** Panitia (Penpot "D2 · Cetak QR absen"): the sheet as it prints, and who is present. BOD reads the list. */
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
  const qrSvg = token ? await QRCode.toString(absolute(origin, praWamPath.checkIn(token)), { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;
  const window = session.startsAt && session.endsAt ? checkInWindow(session.startsAt, session.endsAt) : null;
  return <PraWamShell member={member} current="sesi">
    <ScreenHead eyebrow="Jadwal sesi · QR absen" title={manage ? "Cetak QR absen" : "Daftar hadir"}
      lead={manage ? "Setiap sesi punya satu QR tetap. Cetak dan tempel di ruang; peserta absen sendiri lewat aplikasi." : `${session.title} · ${sessionWhen(session)}`}
      actions={manage && token ? <a className="button button--primary" href={praWamApi.sessionQr(session.id)} target="_blank" rel="noopener"><FileText size={18} aria-hidden /> Unduh PDF A5</a> : undefined} />
    {session.status !== "terbit" && <Notice tone="info">Sesi belum terbit. QR baru mencatat kehadiran setelah sesi diterbitkan.</Notice>}

    <div className={styles.printGrid} style={{ marginTop: 16 }}>
      <section className={base.card} aria-labelledby="hadir">
        <div className={styles.cardHead}><h2 id="hadir">Daftar hadir</h2>{manage && <ButtonLink variant="secondary" href={praWamPath.editSession(session.id)}>Ubah sesi</ButtonLink>}</div>
        <AttendancePanel sessionId={session.id} initial={rows} canEdit={manage} />
        <p className={styles.noteBlue} style={{ margin: "16px 0 0", display: "flex", gap: 8 }}><Info size={16} aria-hidden style={{ flex: "none", marginTop: 2 }} />QR tetap sama selama sesi ada. Kalau jam atau ruang berubah, cukup cetak ulang kertasnya; QR lama tetap berlaku.</p>
      </section>

      {qrSvg && <div>
        <p className={styles.previewLabel}>Pratinjau cetak · A5</p>
        <div className={styles.sheet}>
          <span className={styles.sheetEyebrow}>WAM · absen sesi</span>
          <h2>{session.title}</h2>
          <p>{sessionWhen(session)}</p>
          <p>{sessionWhere(session)}</p>
          <div className={styles.sheetQr} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <ol>
            <li>Buka kamera ponsel atau aplikasi WAM.</li>
            <li>Ketuk Scan QR absen, lalu arahkan ke kode ini.</li>
            <li>Masuk dengan akun WAM bila diminta.</li>
          </ol>
          <span className={styles.sheetRule} />
          <p style={{ fontSize: 12 }}>{window ? `Absen hanya tercatat untuk peserta sesi ini, pada ${clockLabel(wibTime(window.opens))}–${clockLabel(wibTime(window.closes))}.` : "Jendela absen mengikuti jam sesi."}</p>
        </div>
      </div>}
    </div>
    <p style={{ marginTop: 24 }}><a href={praWamPath.dashboard} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, textDecoration: "none" }}><ChevronLeft size={18} aria-hidden />Kembali ke dashboard</a></p>
  </PraWamShell>;
}
