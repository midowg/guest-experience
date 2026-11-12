import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ConsoleButtonLink, DayTimeline, PageHeader, PageTabs, Pill, SectionToolbar, type TimelineRow } from "@/components/console";
import cs from "@/components/console/console.module.css";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { SessionStatusPill } from "@/components/pra-wam/SessionStatusPill";
import { ScheduleExport } from "@/components/pra-wam/manage/ScheduleExport";
import { dayRows, hourWindow, nowHours, readiness, roomRows, timelineLegend, withQuery } from "@/components/pra-wam/manage/schedule";
import { Notice } from "@/components/ui";
import { dayLabel, wibDate } from "@/lib/pra-wam/appraisal";
import { exportDates, rangeLabel } from "@/lib/pra-wam/schedule-export";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { bookingSessionLabel, sessionKindLabels, sessionWhen, sessionWhere, type Session, type SessionStatus } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { daySchedule } from "@/lib/server/pra-wam/appraisal";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import { sessionsWithMinutes } from "@/lib/server/pra-wam/minutes";
import { minutesStatus, minutesStatusLabels } from "@/lib/pra-wam/minutes";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jadwal sesi · WAM", robots: { index: false } };

const groups: { status: SessionStatus; title: string; empty: string }[] = [
  { status: "draf", title: "Draf", empty: "Tidak ada draf." },
  { status: "terbit", title: "Terbit", empty: "Belum ada sesi yang diterbitkan." },
  { status: "batal", title: "Dibatalkan", empty: "" },
];
const lead = "Forum dari kalender Pra WAM masuk sebagai draf. Isi jam, ruang, dan peserta, lalu terbitkan supaya muncul di agenda peserta. Booking ruang langsung terbit sebagai sesi.";

type Search = { view?: string; rentang?: string; tanggal?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const shift = (date: string, days: number) => { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10); };
/** Monday to Sunday of the week holding `date`. */
const weekOf = (date: string) => { const monday = shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)); return [0, 1, 2, 3, 4, 5, 6].map(days => shift(monday, days)); };

/** Jadwal sesi: every session, drafts first (panitia changes, BOD reads); for panitia also a timeline (console "K2"). */
export default async function SessionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await requireMemberPage(praWamPath.sessions);
  if (!seesAllSessions(member)) notFound();
  const { sessions, migrated } = await listSessions(member);
  const manage = managesSessions(member);
  const now = new Date();
  if (!manage) return <BodSessions sessions={sessions} migrated={migrated} now={now}
    minutes={await sessionsWithMinutes(sessions.filter(session => session.status === "terbit").map(session => session.id)).catch(() => null)} />;

  const asked = await searchParams;
  const view = asked.view === "linimasa" ? "linimasa" : "daftar";
  const tabs = [
    { key: "daftar", label: "Daftar", href: praWamPath.sessions },
    { key: "linimasa", label: "Linimasa", href: withQuery(praWamPath.sessions, { view: "linimasa" }) },
  ];
  return <>
    <PageHeader title="Jadwal sesi" subtitle={lead}
      actions={migrated ? <ConsoleButtonLink variant="primary" href={praWamPath.newSession} icon={<Plus size={18} aria-hidden />}>Buat sesi</ConsoleButtonLink> : undefined} />
    <PageTabs label="Tampilan jadwal" tabs={tabs} current={view} />
    {!migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}
    {migrated && (view === "daftar" ? <SessionList sessions={sessions} now={now} minutes={await sessionsWithMinutes(sessions.filter(session => session.status === "terbit").map(session => session.id)).catch(() => null)} /> : <Timeline member={member} sessions={sessions} asked={asked} now={now} />)}
  </>;
}

/**
 * Daftar: the same groups and actions as before, as console tables. A published meeting also
 * says where its MoM stands (11 Nov 2026); `minutes` is null before migration 202611110002.
 */
function SessionList({ sessions, now, minutes }: { sessions: Session[]; now: Date; minutes: Set<string> | null }) {
  return <>{groups.map(group => {
    const items = sessions.filter(session => session.status === group.status);
    if (!items.length && !group.empty) return null;
    return <section key={group.status} className={styles.section} aria-labelledby={`grup-${group.status}`}>
      <SectionToolbar title={<span id={`grup-${group.status}`}>{group.title}</span>} count={items.length} />
      {items.length === 0 ? <p className={styles.empty}>{group.empty}</p> : <div className={cs.tableWrap}>
        <table className={cs.table}>
          <thead><tr><th>Sesi</th><th>Waktu</th><th>Tempat</th><th>Peserta</th><th>Status</th><th>MoM</th><th>Tindakan</th></tr></thead>
          <tbody>{items.map(session => {
            const status = readiness(session, now);
            return <tr key={session.id}>
              <td><span className={styles.cellMain}><a className={styles.cellLink} href={praWamPath.managedSession(session.id)}>{session.title}</a><small>{sessionKindLabels[session.kind]}</small>{session.booking && <span><Pill tone="blue">{bookingSessionLabel(session)}</Pill></span>}</span></td>
              <td>{sessionWhen(session)}</td>
              <td>{sessionWhere(session)}</td>
              <td>{session.participantCount}</td>
              <td><Pill tone={status.tone}>{status.label}</Pill></td>
              <td><MomCell session={session} minutes={minutes} now={now} /></td>
              <td><div className={styles.rowActions}>
                <ConsoleButtonLink href={praWamPath.editSession(session.id)}>{session.booking ? "Lihat" : session.status === "draf" ? "Atur" : "Ubah"}</ConsoleButtonLink>
                {session.status === "terbit" && <ConsoleButtonLink href={praWamPath.sessionAttendance(session.id)}>Absen (ubah)</ConsoleButtonLink>}
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>;
  })}</>;
}

/** Linimasa: a week by day (Minggu), or one day by room with the room bookings (Hari). */
async function Timeline({ member, sessions, asked, now }: { member: Member; sessions: Session[]; asked: Search; now: Date }) {
  const today = wibDate(now.toISOString());
  const range = asked.rentang === "hari" ? "hari" : "minggu";
  const date = asked.tanggal && DATE.test(asked.tanggal) ? asked.tanggal : today;
  const link = (query: { rentang?: string; tanggal?: string }) => withQuery(praWamPath.sessions, { view: "linimasa", rentang: query.rentang ?? range, tanggal: query.tanggal === today ? undefined : query.tanggal });
  const hrefs = { hari: link({ rentang: "hari", tanggal: date }), minggu: link({ rentang: "minggu", tanggal: date }) };
  const sessionHref = (session: Session) => praWamPath.editSession(session.id);
  const shown = sessions.filter(session => session.status !== "batal");

  let rows: TimelineRow[], title: string, when: string;
  if (range === "minggu") {
    const week = weekOf(date);
    // The weekend shows only when something happens on it.
    const dates = week.filter((day, index) => index < 5 || shown.some(session => session.startsAt && session.endsAt && wibDate(session.startsAt) <= day && day <= wibDate(session.endsAt)));
    rows = dayRows(dates, shown, sessionHref, today);
    title = "Sesi per hari";
    when = `${week.includes(today) ? "Minggu ini · " : ""}${dayLabel(week[0])} – ${dayLabel(week[6])}`;
  } else {
    const schedule = await daySchedule(date, member).catch(() => null);
    rows = roomRows({ date, rooms: schedule?.rooms ?? [], bookings: schedule?.bookings ?? [], sessions: shown, sessionHref, bookingHref: booking => praWamPath.appraisal(date, booking.id) });
    title = "Ruang dan sesi";
    when = `${date === today ? "Hari ini · " : ""}${dayLabel(date)}`;
  }
  const hours = hourWindow(rows);
  const step = range === "minggu" ? 7 : 1;
  const unit = range === "minggu" ? "Minggu" : "Hari";
  return <>
    <div className={styles.toolRow}>
      <div className={styles.toolGroup}>
        <ConsoleButtonLink href={link({ tanggal: shift(date, -step) })} icon={<ChevronLeft size={18} aria-hidden />}>{unit} sebelumnya</ConsoleButtonLink>
        <ConsoleButtonLink href={link({ tanggal: today })}>{range === "minggu" ? "Minggu ini" : "Hari ini"}</ConsoleButtonLink>
        <ConsoleButtonLink href={link({ tanggal: shift(date, step) })}>{unit} berikutnya<ChevronRight size={18} aria-hidden /></ConsoleButtonLink>
        <ScheduleExport range={range} date={date} label={rangeLabel(exportDates(range, date))} />
      </div>
      <ul className={styles.legend} aria-label="Arti warna">
        {timelineLegend(range === "hari").map(item => <li key={item.label}><Pill tone={item.tone}>{item.label}</Pill></li>)}
      </ul>
    </div>
    <DayTimeline title={title} date={when} rows={rows} from={hours.from} to={hours.to} range={{ value: range, hrefs }}
      now={range === "hari" ? (date === today ? nowHours(now) : undefined) : undefined}
      empty={range === "hari" ? "Belum ada ruang yang bisa dibooking." : "Tidak ada sesi minggu ini."} />
  </>;
}

/** Where a published meeting's MoM stands, for the tables; a dash when it does not need one yet. */
function MomCell({ session, minutes, now, app = false }: { session: Session; minutes: Set<string> | null; now: Date; app?: boolean }) {
  if (!minutes || session.status !== "terbit") return <>—</>;
  const status = minutesStatus(session, minutes.has(session.id), now);
  if (status === "tidak-perlu" || status === "belum-waktunya") return <>—</>;
  // The BOD's frame is the app's, not the console's: its own pills there.
  return app ? <span className={`${base.pill} ${status === "sudah" ? base.pillLine : base.pillBrass}`}>{minutesStatusLabels[status]}</span>
    : <Pill tone={status === "sudah" ? "ok" : "warn"}>{minutesStatusLabels[status]}</Pill>;
}

/** A BOD reads the list as before, in the BOD's own frame, with where each MoM stands (11 Nov 2026). */
function BodSessions({ sessions, migrated, now, minutes }: { sessions: Session[]; migrated: boolean; now: Date; minutes: Set<string> | null }) {
  const table = (items: Session[]) => <div className={base.tableWrap}>
    <table className={base.table}>
      <thead><tr><th>Sesi</th><th>Waktu</th><th>Tempat</th><th>Peserta</th><th>Status</th><th>MoM</th><th>Tindakan</th></tr></thead>
      <tbody>{items.map(session => <tr key={session.id}>
        <td><strong><a href={praWamPath.managedSession(session.id)}>{session.title}</a></strong><small>{sessionKindLabels[session.kind]}</small>{session.booking && <small>{bookingSessionLabel(session)}</small>}</td>
        <td>{sessionWhen(session)}</td>
        <td>{sessionWhere(session)}</td>
        <td>{session.participantCount}</td>
        <td><SessionStatusPill session={session} now={now} /></td>
        <td><MomCell session={session} minutes={minutes} now={now} app /></td>
        <td><div className={styles.actionsCell}>
          {session.status === "terbit" && <a className="button button--secondary" href={praWamPath.sessionAttendance(session.id)}>Absen (ubah)</a>}
          <a className="button button--secondary" href={praWamPath.managedSession(session.id)}>Lihat</a>
        </div></td>
      </tr>)}</tbody>
    </table>
  </div>;
  return <>
    <ScreenHead eyebrow="Baca saja" title="Jadwal sesi" lead={lead} />
    {!migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}
    {migrated && groups.map(group => {
      const items = sessions.filter(session => session.status === group.status);
      if (!items.length && !group.empty) return null;
      return <section key={group.status} className={base.card} aria-labelledby={`grup-${group.status}`}>
        <div className={styles.cardHead}><h2 id={`grup-${group.status}`}>{group.title} <span className={base.meta}>({items.length})</span></h2></div>
        {items.length ? table(items) : <p className={base.meta}>{group.empty}</p>}
      </section>;
    })}
  </>;
}
