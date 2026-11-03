import { ArrowLeftRight, BarChart3, Bell, CalendarClock, ChevronRight, Clock, Info, MapPin, QrCode } from "lucide-react";
import { PhaseBanner } from "@/components/pra-wam/PhaseBanner";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { clockLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { requestStatusLabels, spanLabel } from "@/lib/pra-wam/requests";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { agendaItems, untilLabel } from "@/lib/server/pra-wam/agenda";
import { myNotifications } from "@/lib/server/pra-wam/announcements";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { myOpenRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda · WAM", robots: { index: false } };

const greeting = (now: Date) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
};
const longDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(now);
const shortTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** Beranda (Penpot "P1 · Beranda peserta"): the next thing, what waits on the person, the latest news. */
export default async function HomePage() {
  const member = await requireMemberPage(praWamPath.home);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const [{ items }, notes, requests, appraisal] = await Promise.all([agendaItems(member, today), myNotifications(member), myOpenRequests(member), appraisalOpen()]);
  const next = items.find(item => new Date(item.endsAt) > now);
  const latest = notes.items[0];
  const request = requests[0];
  return <PraWamShell member={member} current="beranda">
    <div className={styles.head} style={{ marginBottom: 4 }}>
      <PhaseBanner />
      <a className={styles.iconButton} href={praWamPath.notifications} aria-label={notes.unread ? `Notifikasi, ${notes.unread} belum dibaca` : "Notifikasi"}>
        <Bell aria-hidden />{notes.unread > 0 && <span className={styles.iconDot} />}
      </a>
    </div>
    <h1 className={styles.greet}>{greeting(now)}, {member.nickname || member.name.split(" ")[0]}</h1>
    <p className={styles.meta} style={{ margin: "0 0 16px" }}>{member.department ? `${member.department} · ` : ""}{longDate(now)}</p>

    {next ? <section className={styles.hero} aria-label="Berikutnya">
      <div className={styles.heroTop}><span>Berikutnya · {next.tag}</span><span>{untilLabel(next, now, today)}</span></div>
      <h2><a href={next.href}>{next.title}</a></h2>
      <span className={styles.heroLine}><Clock aria-hidden />{wibDate(next.startsAt) === today ? "" : `${spanLabel(next.startsAt, next.endsAt).split(" · ")[0]} · `}{clockLabel(wibTime(next.startsAt))}–{clockLabel(wibTime(next.endsAt))}</span>
      <span className={styles.heroLine}><MapPin aria-hidden />{next.where}</span>
      {next.kind === "sesi" && (next.checkedInAt
        ? <span className={styles.heroButton}>Absen tercatat {shortTime(next.checkedInAt)}</span>
        : <a className={styles.heroButton} href={praWamPath.scan}><QrCode size={20} aria-hidden />Scan QR absen</a>)}
      {next.kind === "appraisal" && <a className={styles.heroButton} href={next.href}><CalendarClock size={20} aria-hidden />Lihat jadwal ruang</a>}
    </section> : <section className={styles.card}>
      <h2>Belum ada agenda</h2>
      <p className={styles.meta} style={{ margin: 0 }}>Sesi muncul di sini setelah panitia menerbitkannya.</p>
    </section>}

    {request && <section className={styles.card} aria-label="Permintaan Anda">
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <strong className={styles.meta} style={{ fontWeight: 700 }}>Permintaan Anda</strong>
        <span className={styles.pill}><Clock aria-hidden />{requestStatusLabels[request.status]}</span>
      </div>
      <p style={{ margin: "8px 0 0" }}><a href={praWamPath.session(request.sessionId)} style={{ color: "var(--pw-text)", textDecoration: "none" }}>{request.sessionTitle}: usul pindah ke {spanLabel(request.toStartsAt, request.toEndsAt)}</a></p>
    </section>}

    {latest && <a className={`${styles.card} ${styles.row}`} href={praWamPath.notifications} style={{ display: "flex", textDecoration: "none", color: "var(--pw-text)" }}>
      <span className={styles.tile}>{latest.kind === "sesi" ? <ArrowLeftRight aria-hidden /> : <Info aria-hidden />}</span>
      <span><strong style={{ display: "block" }}>{latest.title}</strong><span className={styles.meta}>{latest.kind === "sesi" ? "Kabar sesi" : "Dari panitia"} · {shortTime(latest.createdAt)}</span></span>
    </a>}

    <div className={styles.section} style={{ marginTop: 16 }}>
      {appraisal && <a className={styles.cardLink} href={praWamPath.appraisal()}>
        <CalendarClock size={22} aria-hidden /><span>Appraisal &amp; 1-on-1<small>Pesan ruang atau lihat siapa memakai ruang</small></span><ChevronRight size={20} aria-hidden />
      </a>}
      {seesAllSessions(member) && <a className={styles.cardLink} href={praWamPath.dashboard}>
        <BarChart3 size={22} aria-hidden /><span>Kelola acara<small>Ringkasan operasional, jadwal sesi, permintaan</small></span><ChevronRight size={20} aria-hidden />
      </a>}
    </div>
  </PraWamShell>;
}
