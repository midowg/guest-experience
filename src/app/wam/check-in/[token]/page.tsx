import { AlertTriangle, CalendarDays, CheckCircle2, CircleCheck, Clock, Info, MapPin, QrCode, XCircle } from "lucide-react";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ButtonLink, Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import type { CheckInResult } from "@/lib/pra-wam/attendance";
import { sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { checkIn } from "@/lib/server/pra-wam/attendance";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen · WAM", robots: { index: false }, referrer: "no-referrer" };

const at = (iso: string) => `${dayLabel(wibDate(iso))}, ${clockLabel(wibTime(iso))}`;
const span = (opens: string, closes: string) => `${clockLabel(wibTime(opens))}–${clockLabel(wibTime(closes))}`;

type Shown = { tone: "success" | "info" | "warning" | "error"; title: string; text: string; status: string };

function answer(result: CheckInResult, name: string): Shown {
  switch (result.kind) {
    case "tercatat": return { tone: "success", title: "Absen tercatat", text: `Terima kasih, ${name}. Selamat mengikuti sesi.`, status: at(result.checkedInAt) };
    case "sudah": return { tone: "success", title: "Sudah tercatat", text: "Kehadiranmu sudah tercatat. Tidak perlu memindai lagi.", status: at(result.checkedInAt) };
    case "belum": return { tone: "warning", title: "Absen belum dibuka", text: `QR sesi ini hanya berlaku pada ${span(result.window.opens, result.window.closes)}. Scan lagi saat sesi berlangsung.`, status: "Belum tercatat" };
    case "tutup": return { tone: "warning", title: "Absen sudah ditutup", text: `Absen ditutup ${at(result.window.closes)}. Bila kamu hadir, minta panitia mencatat secara manual.`, status: "Belum tercatat" };
    case "bukan-peserta": return { tone: "warning", title: "Kamu tidak terdaftar", text: "Kamu bukan peserta sesi ini. Bila seharusnya ikut, minta panitia menambahkanmu atau mencatat kehadiranmu.", status: "Tidak dicatat" };
    case "belum-terbit": return { tone: "info", title: "Sesi belum terbit", text: "Sesi ini belum diterbitkan panitia, jadi absen belum bisa dicatat.", status: "Belum tercatat" };
    default: return { tone: "error", title: "QR tidak dikenal", text: "QR ini sudah diganti atau bukan QR absen WAM. Pindai QR yang terpasang di ruang sesi.", status: "Tidak dicatat" };
  }
}

const marks = { success: <CircleCheck aria-hidden />, info: <Info aria-hidden />, warning: <AlertTriangle aria-hidden />, error: <XCircle aria-hidden /> };

/**
 * What a printed session QR opens (Penpot "P5 · Absen tercatat" and "P13 · Absen belum dibuka"):
 * signs the person in, after signing in to Pra WAM if needed, and says plainly what happened.
 */
export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await requireMemberPage(praWamPath.checkIn(token));
  const outcome = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await checkIn(token, member).catch((error: unknown) => { if (error instanceof ServiceError) return error.message; throw error; })
    : { result: { kind: "tidak-dikenal" } as CheckInResult, session: null };
  if (typeof outcome === "string") return <PraWamShell member={member} current="agenda" back={{ href: praWamPath.agenda, title: "Absen sesi" }}><Notice tone="warning">{outcome}</Notice></PraWamShell>;
  const shown = answer(outcome.result, member.nickname || member.name.split(" ")[0]);
  // The room for the card; a person outside the session simply gets no room line.
  const session: Session | null = outcome.session ? await getSession(outcome.session.id, member).catch(() => null) : null;
  const recorded = outcome.result.kind === "tercatat" || outcome.result.kind === "sudah";
  return <PraWamShell member={member} current="agenda" back={{ href: praWamPath.agenda, title: "Absen sesi" }}>
    
    <section className={`${styles.checkin} ${styles.narrow}`} data-tone={shown.tone} aria-live="polite">
      <span className={styles.checkinMark}>{marks[shown.tone]}</span>
      <h1>{shown.title}</h1>
      <p>{shown.text}</p>
      {outcome.session && <div className={styles.card}>
        <dl className={styles.infoList}>
          <div className={styles.row}><span className={styles.tile}><CalendarDays aria-hidden /></span><div><dt>Sesi</dt><dd>{outcome.session.title}</dd></div></div>
          {session && <div className={styles.row}><span className={styles.tile}><MapPin aria-hidden /></span><div><dt>Ruang</dt><dd>{sessionWhere(session)}</dd></div></div>}
          <div className={styles.row}><span className={styles.tile}>{recorded ? <Clock aria-hidden /> : <CheckCircle2 aria-hidden />}</span><div><dt>{recorded ? "Waktu absen" : "Status absen"}</dt><dd>{shown.status}</dd></div></div>
        </dl>
      </div>}
      {recorded && <Notice tone="info">Scan ulang tidak menggandakan absen.</Notice>}
      {!recorded && shown.tone !== "info" && <Notice tone="warning">Pastikan QR yang kamu scan sesuai ruang. Kalau kamu bukan peserta sesi ini, absen tidak bisa dicatat.</Notice>}
      <div className={styles.actions} style={{ justifyContent: "center" }}>
        {!recorded && <a className="button button--primary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan lagi</a>}
        {outcome.session && session && <ButtonLink variant={recorded ? "primary" : "secondary"} href={praWamPath.session(outcome.session.id)}>Buka sesi</ButtonLink>}
        <ButtonLink variant="secondary" href={praWamPath.agenda}><CalendarDays size={18} aria-hidden /> Kembali ke agenda</ButtonLink>
      </div>
    </section>
  </PraWamShell>;
}
