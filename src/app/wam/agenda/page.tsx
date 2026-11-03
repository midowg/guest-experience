import { CheckCircle2, Clock, Info, MapPin, QrCode } from "lucide-react";
import { PhaseBanner } from "@/components/pra-wam/PhaseBanner";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { agendaItems } from "@/lib/server/pra-wam/agenda";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · WAM", robots: { index: false } };

const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const shortTime = (iso: string) => clockLabel(wibTime(iso));

/** Agenda saya (Penpot "P2"): one day at a time as a timeline, the days with something as chips. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: tanggal } = await searchParams;
  const member = await requireMemberPage(praWamPath.agenda);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const { items, migrated } = await agendaItems(member, today);
  const days = [...new Set([today, ...items.map(item => wibDate(item.startsAt))])].sort();
  const day = tanggal && days.includes(tanggal) ? tanggal : days.find(date => items.some(item => wibDate(item.startsAt) === date && new Date(item.endsAt) > now)) ?? today;
  const shown = items.filter(item => wibDate(item.startsAt) === day);
  const nextId = shown.find(item => new Date(item.endsAt) > now)?.key;
  const later = items.find(item => wibDate(item.startsAt) > day);
  return <PraWamShell member={member} current="agenda">
    <PhaseBanner />
    <ScreenHead title="Agenda saya" actions={<a className="button button--secondary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan QR absen</a>} />
    {!migrated && <Notice tone="info">Sesi forum belum tersedia. Booking appraisal tetap tampil di sini.</Notice>}
    <nav className={styles.dates} aria-label="Pilih hari" style={{ marginBottom: 20 }}>
      {days.map(date => <a key={date} className={`${styles.chip} ${styles.chipStack}`} href={`${praWamPath.agenda}?date=${date}`} aria-current={date === day ? "date" : undefined}>
        {chipDay(date)}<small>{chipDate(date)}{date === today ? " · hari ini" : ""}</small>
      </a>)}
    </nav>
    {shown.length === 0 ? <p className={styles.meta}>{day === today ? "Tidak ada agenda hari ini." : `Tidak ada agenda ${dayLabel(day)}.`}</p>
      : <ol className={styles.timeline} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map(item => {
          const done = new Date(item.endsAt) <= now;
          return <li key={item.key} className={styles.timeItem}>
            <time dateTime={item.startsAt}>{shortTime(item.startsAt)}<small>{shortTime(item.endsAt)}</small></time>
            <span className={styles.timeRail}><span className={`${styles.timeDot} ${item.checkedInAt || done ? styles.timeDotDone : item.key === nextId ? styles.timeDotNow : ""}`} /></span>
            <div className={styles.timeBody}>
              <h3><a href={item.href}>{item.title}</a></h3>
              <span className={styles.place}><MapPin aria-hidden />{item.where}</span>
              <div className={styles.pills}>
                {item.checkedInAt && <span className={`${styles.pill} ${styles.pillSuccess}`}><CheckCircle2 aria-hidden />Hadir {shortTime(item.checkedInAt)}</span>}
                {!item.checkedInAt && item.key === nextId && <span className={styles.pill}><Clock aria-hidden />Berikutnya</span>}
                <span className={`${styles.pill} ${styles.pillLine}`}>{item.tag}</span>
              </div>
            </div>
          </li>;
        })}
      </ol>}
    {later && <p className={styles.callout}><Info aria-hidden />{dayLabel(wibDate(later.startsAt))}: {later.title}</p>}
    {seesAllSessions(member) && <p className={styles.hint} style={{ marginTop: 16 }}>Draf dan sesi semua peserta ada di <a href={praWamPath.sessions}>Jadwal sesi</a>.</p>}
  </PraWamShell>;
}
