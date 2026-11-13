import { redirect } from "next/navigation";
import { Info, QrCode } from "lucide-react";
import { AgendaSheet } from "@/components/pra-wam/AgendaSheet";
import { AgendaTimeline } from "@/components/pra-wam/desktop/AgendaTimeline";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { pickDay } from "@/lib/pra-wam/agenda";
import { dayLabel, wibDate } from "@/lib/pra-wam/appraisal";
import { bodOnly, cancelsAnyBooking, seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { agendaItems } from "@/lib/server/pra-wam/agenda";
import { bookingOpenFor } from "@/lib/server/pra-wam/events";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import own from "@/components/pra-wam/desktop/home.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · WAM", robots: { index: false } };

const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** The agenda address with a day and the item open over it. */
const agendaHref = (query: { date?: string; item?: string }) => {
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
  return `${praWamPath.agenda}${search ? `?${search}` : ""}`;
};

/**
 * Agenda saya (Penpot P2 on a phone, E2 on a desktop): one day at a time as a timeline, the days
 * with something as chips. A tap on an item opens its detail over the page (AgendaSheet): Detail
 * sesi (P3) or the booking, a sheet from the bottom on a phone and a panel from the right on a
 * desktop. ?item=<key> keeps it open (?session= from older links works too).
 *
 * Since 5 Nov 2026 the agenda lives on Beranda for everyone but a BOD (whose home is Ringkasan):
 * they are sent there with the same day and item, so older links and notifications keep working.
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string; item?: string; session?: string }> }) {
  const { date: tanggal, item: asked, session: older } = await searchParams;
  const member = await requireMemberPage(praWamPath.agenda);
  if (!bodOnly(member)) {
    const search = new URLSearchParams(Object.entries({ date: tanggal, item: asked ?? older }).filter((entry): entry is [string, string] => !!entry[1])).toString();
    redirect(`${praWamPath.home}${search ? `?${search}` : ""}#agenda`);
  }
  const now = new Date();
  const today = wibDate(now.toISOString());
  const [{ items, migrated }, bookingOpen] = await Promise.all([agendaItems(member, today), bookingOpenFor(member)]);
  // An item asked for in the address opens on its own day.
  const askedDay = items.find(item => item.key === (asked ?? older));
  const { days, day } = pickDay(items, tanggal ?? (askedDay && wibDate(askedDay.startsAt)), today, now);
  const shown = items.filter(item => wibDate(item.startsAt) === day);
  const later = items.find(item => wibDate(item.startsAt) > day);
  return <>
    <div className={own.agenda}>
      <div className={own.col}>
        <ScreenHead title="Agenda saya" actions={<a className="button button--secondary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan QR absen</a>} />
        {!migrated && <Notice tone="info">Sesi forum belum tersedia. Booking ruang tetap tampil di sini.</Notice>}
        <nav className={base.dates} aria-label="Pilih hari">
          {days.map(date => <a key={date} className={`${base.chip} ${base.chipStack}`} href={agendaHref({ date })} aria-current={date === day ? "date" : undefined}>
            {chipDay(date)}<small>{chipDate(date)}{date === today ? " · hari ini" : ""}</small>
          </a>)}
        </nav>
        {shown.length === 0
          ? <p className={base.meta}>{items.length === 0
            ? "Belum ada sesi di agenda kamu. Sesi muncul di sini setelah panitia menerbitkannya."
            : day === today ? "Tidak ada agenda hari ini." : `Tidak ada agenda ${dayLabel(day)}.`}</p>
          : <section className={`${base.card} ${own.timelineCard}`} aria-label={`Agenda ${dayLabel(day)}`}>
            <AgendaTimeline items={shown} now={now} href={item => agendaHref({ date: day, item: item.key })} />
          </section>}
        {later && <a className={`${base.callout} ${own.calloutLink}`} href={agendaHref({ date: wibDate(later.startsAt) })}><Info aria-hidden />{dayLabel(wibDate(later.startsAt))}: {later.title}</a>}
        {seesAllSessions(member) && <p className={base.hint}>Draf dan sesi semua peserta ada di <a href={praWamPath.sessions}>Jadwal sesi</a>.</p>}
      </div>
    </div>
    <AgendaSheet items={items} version={now.toISOString()} cancelsAny={cancelsAnyBooking(member)} bookingOpen={bookingOpen} />
  </>;
}
