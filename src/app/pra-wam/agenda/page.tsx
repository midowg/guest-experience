import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { myBookings } from "@/lib/server/pra-wam/appraisal";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · Pra WAM", robots: { index: false } };

type Item = { key: string; at: string; title: string; href: string; tag: string; when: string; where: string };

/** The person's published sessions and appraisal bookings, by day, from today on. */
export default async function AgendaPage() {
  const member = await requireMemberPage(praWamPath.agenda);
  const today = wibDate(new Date().toISOString());
  const [{ sessions, migrated }, bookings] = await Promise.all([
    listSessions(member),
    myBookings(member, today).catch(() => []),
  ]);
  const items: Item[] = [
    ...sessions.filter(session => session.status === "terbit" && session.isParticipant && session.startsAt && wibDate(session.startsAt) >= today).map(session => ({
      key: session.id, at: session.startsAt!, title: session.title, href: praWamPath.session(session.id), tag: sessionKindLabels[session.kind], when: sessionWhen(session), where: sessionWhere(session),
    })),
    ...bookings.map(booking => ({
      key: booking.id, at: booking.startsAt, title: booking.title, href: praWamPath.appraisal(wibDate(booking.startsAt)), tag: "Appraisal",
      when: `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`, where: booking.bookedBy.id === member.id ? "Booking kamu" : `Bersama ${booking.bookedBy.name}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const days = [...new Set(items.map(item => wibDate(item.at)))];
  return <PraWamShell member={member} current="agenda">
    <div className={styles.head}><div><p className={styles.kicker}>Halo, {member.nickname || member.name}</p><h1>Agenda</h1>
      <p>Sesi Pra WAM yang kamu ikuti dan booking appraisal, mulai hari ini.</p></div></div>
    {!migrated && <Notice tone="info">Sesi forum belum tersedia. Booking appraisal tetap tampil di sini.</Notice>}
    {seesAllSessions(member) && <Notice tone="info">Draf dan sesi semua peserta ada di <a href={praWamPath.sessions}>Semua sesi</a>.</Notice>}
    {days.length === 0 ? <section className={styles.card}><p className={styles.meta}>Belum ada agenda. Sesi muncul di sini setelah panitia menerbitkannya.</p></section>
      : days.map(day => <section key={day} className={styles.card} aria-labelledby={`hari-${day}`}>
        <h2 id={`hari-${day}`}>{day === today ? "Hari ini" : dayLabel(day)}</h2>
        <div className={styles.mine}>{items.filter(item => wibDate(item.at) === day).map(item => <article key={item.key} className={styles.mineItem}>
          <span className={styles.kicker}>{item.tag}</span>
          <h3><a href={item.href}>{item.title}</a></h3>
          <span className={styles.meta}>{item.when} · {item.where}</span>
        </article>)}</div>
      </section>)}
  </PraWamShell>;
}
