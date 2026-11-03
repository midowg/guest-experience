import { Info, QrCode } from "lucide-react";
import { AgendaTimeline } from "@/components/pra-wam/desktop/AgendaTimeline";
import { SessionPanel } from "@/components/pra-wam/desktop/SessionPanel";
import { PhaseBanner } from "@/components/pra-wam/PhaseBanner";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { dayLabel, wibDate } from "@/lib/pra-wam/appraisal";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { agendaItems } from "@/lib/server/pra-wam/agenda";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import own from "@/components/pra-wam/desktop/home.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · WAM", robots: { index: false } };

const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** The agenda address with a day and, on a desktop, the item open in the detail panel. */
const agendaHref = (query: { date?: string; session?: string }) => {
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
  return `${praWamPath.agenda}${search ? `?${search}` : ""}`;
};

/**
 * Agenda saya (Penpot P2 on a phone, E2 on a desktop): one day at a time as a timeline, the days
 * with something as chips; on a desktop the selected item opens on the right (?session=<id>,
 * the next one by default).
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string; session?: string }> }) {
  const { date: tanggal, session: picked } = await searchParams;
  const member = await requireMemberPage(praWamPath.agenda);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const { items, migrated } = await agendaItems(member, today);
  const days = [...new Set([today, ...items.map(item => wibDate(item.startsAt))])].sort();
  const day = tanggal && days.includes(tanggal) ? tanggal : days.find(date => items.some(item => wibDate(item.startsAt) === date && new Date(item.endsAt) > now)) ?? today;
  const shown = items.filter(item => wibDate(item.startsAt) === day);
  const selected = shown.find(item => item.key === picked) ?? shown.find(item => new Date(item.endsAt) > now) ?? shown[0];
  const later = items.find(item => wibDate(item.startsAt) > day);
  return <PraWamShell member={member} current="agenda">
    <PhaseBanner />
    <div className={own.agenda}>
      <div className={own.col}>
        <ScreenHead title="Agenda saya" actions={<a className="button button--secondary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan QR absen</a>} />
        {!migrated && <Notice tone="info">Sesi forum belum tersedia. Booking appraisal tetap tampil di sini.</Notice>}
        <nav className={base.dates} aria-label="Pilih hari">
          {days.map(date => <a key={date} className={`${base.chip} ${base.chipStack}`} href={agendaHref({ date })} aria-current={date === day ? "date" : undefined}>
            {chipDay(date)}<small>{chipDate(date)}{date === today ? " · hari ini" : ""}</small>
          </a>)}
        </nav>
        {shown.length === 0
          ? <p className={base.meta}>{day === today ? "Tidak ada agenda hari ini." : `Tidak ada agenda ${dayLabel(day)}.`}</p>
          : <section className={`${base.card} ${own.timelineCard}`} aria-label={`Agenda ${dayLabel(day)}`}>
            <AgendaTimeline items={shown} now={now} selectedKey={selected?.key} select={item => agendaHref({ date: day, session: item.key })} />
          </section>}
        {later && <p className={base.callout}><Info aria-hidden />{dayLabel(wibDate(later.startsAt))}: {later.title}</p>}
        {seesAllSessions(member) && <p className={base.hint}>Draf dan sesi semua peserta ada di <a href={praWamPath.sessions}>Jadwal sesi</a>.</p>}
      </div>
      <div className={own.panel}>
        <SessionPanel item={selected} member={member} />
      </div>
    </div>
  </PraWamShell>;
}
