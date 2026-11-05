import { notFound } from "next/navigation";
import { CalendarClock, CalendarDays, ChevronRight, Megaphone, Plus, QrCode, UserCheck } from "lucide-react";
import { Avatar, Card, ConsoleButtonLink, DayTimeline, ListRow, PageHeader, Pill, RowList, StatCard, StatRow } from "@/components/console";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { BodSummary } from "@/components/pra-wam/BodSummary";
import { SessionStatusPill } from "@/components/pra-wam/SessionStatusPill";
import { hourWindow, nowHours, phaseDay, readiness, roomRows, timelineLegend } from "@/components/pra-wam/manage/schedule";
import { Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { greeting } from "@/lib/pra-wam/bod";
import { spanLabel } from "@/lib/pra-wam/requests";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamApi, praWamPath } from "@/lib/routes";
import { sentAnnouncements } from "@/lib/server/pra-wam/announcements";
import { daySchedule } from "@/lib/server/pra-wam/appraisal";
import { bodSummary, overview, type Overview } from "@/lib/server/pra-wam/dashboard";
import { currentPhase } from "@/lib/server/pra-wam/events";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { participationOf } from "@/lib/server/pra-wam/recap";
import { allRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ringkasan operasional · WAM", robots: { index: false } };

const longDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(now);
const submitted = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * Ringkasan operasional (Penpot "D1", console "K1") for panitia; BOD gets Ringkasan Pra WAM
 * (Penpot "B1", "E3"), and the panitia's page read only with ?lihat=panitia ("Dashboard panitia (baca)").
 */
/** The open questionnaire for the Survei card: its name and participation; null before it opens, and never in the way of Ringkasan. */
async function questionnaireSurvey() {
  const form = await currentForm().catch(() => null);
  if (!form || form.status === "draf") return null;
  const participation = await participationOf(form).catch(() => null);
  return participation ? { name: form.name, participation } : null;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ lihat?: string }> }) {
  const member = await requireMemberPage(praWamPath.dashboard);
  if (!seesAllSessions(member)) notFound();
  const manage = managesSessions(member);
  const now = new Date();
  // BOD reads everything and changes nothing: their own summary.
  if (!manage && (await searchParams).lihat !== "panitia") {
    const [summary, survey] = await Promise.all([bodSummary(member, now), questionnaireSurvey()]);
    return <>
      {!summary.migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}
      <BodSummary data={summary} greeting={`${greeting(now)}, ${member.nickname || member.name.split(" ")[0]}`} date={longDate(now)} survey={survey} />
    </>;
  }
  const data = await overview(member, now);
  if (!manage) return <BodReadView data={data} now={now} />;
  return <PanitiaSummary member={member} data={data} now={now} />;
}

/** K1: the day at a glance for the panitia, in the console panel. */
async function PanitiaSummary({ member, data, now }: { member: Member; data: Overview; now: Date }) {
  const today = wibDate(now.toISOString());
  const [{ sessions }, schedule, phase, requests, announcements] = await Promise.all([
    listSessions(member), daySchedule(today, member).catch(() => null), currentPhase(today).catch(() => null),
    allRequests(member).catch(() => null), sentAnnouncements(member).catch(() => null),
  ]);
  const todays = sessions.filter(session => session.status === "terbit" && session.startsAt && wibDate(session.startsAt) === today);
  const live = todays.filter(session => session.startsAt && session.endsAt && new Date(session.startsAt) <= now && now < new Date(session.endsAt)).length;
  const coming = todays.filter(session => session.startsAt && new Date(session.startsAt) > now).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  // "Cetak QR absen" opens the session that is on now or next today, else the next one at all.
  const printable = data.upcoming.find(session => session.endsAt && new Date(session.endsAt) > now && !session.booking);
  const rows = data.migrated ? roomRows({
    date: today, rooms: schedule?.rooms ?? [], bookings: schedule?.bookings ?? [], sessions: todays,
    sessionHref: session => praWamPath.sessionAttendance(session.id), bookingHref: booking => praWamPath.appraisal(today, booking.id),
  }) : [];
  const hours = hourWindow(rows);
  const latest = announcements?.items[0];
  const open = requests?.open ?? [];
  const day = phaseDay(phase, today);

  return <>
    <PageHeader title="Ringkasan operasional" subtitle={[longDate(now), day].filter(Boolean).join(" · ")}
      actions={<>
        {printable && <ConsoleButtonLink href={praWamPath.sessionAttendance(printable.id)} icon={<QrCode size={18} aria-hidden />}>Cetak QR absen</ConsoleButtonLink>}
        <ConsoleButtonLink variant="primary" href={praWamPath.newSession} icon={<Plus size={18} aria-hidden />}>Buat sesi</ConsoleButtonLink>
      </>} />
    {!data.migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}

    <StatRow label="Angka hari ini">
      <StatCard label="Sesi hari ini" value={todays.length} icon={<CalendarDays size={18} />} href={praWamPath.sessions}
        note={live ? `${live} sedang berlangsung` : coming[0]?.startsAt ? `Berikutnya ${clockLabel(wibTime(coming[0].startsAt))}` : todays.length ? "Semua sudah selesai" : "Tidak ada sesi terbit"} />
      <StatCard label="Permintaan jadwal" value={data.openRequests} tone={data.openRequests ? "warn" : undefined} icon={<CalendarClock size={18} />} href={praWamPath.requests}
        note={data.openRequests ? "Menunggu jawaban panitia" : "Tidak ada yang menunggu"} />
      <StatCard label="Hadir hari ini" value={data.todayExpected ? `${data.todayPresent} / ${data.todayExpected}` : "—"} tone={data.todayExpected ? "ok" : undefined} icon={<UserCheck size={18} />}
        note={data.todayExpected ? "Peserta sesi hari ini yang sudah absen" : "Belum ada peserta yang diharapkan"} />
      <StatCard label="Pengumuman" value={announcements?.items.length ?? "—"} icon={<Megaphone size={18} />} href={praWamPath.announcements}
        note={latest ? `Terakhir: ${latest.read} dari ${latest.recipients} sudah membaca` : "Belum ada yang dikirim"} />
    </StatRow>

    <DayTimeline title="Sesi hari ini" titleHref={praWamPath.sessions} date={longDate(now)} rows={rows} from={hours.from} to={hours.to} now={nowHours(now)}
      empty={data.migrated ? "Belum ada ruang atau sesi untuk hari ini." : "Linimasa muncul setelah migrasi sesi."} />
    {rows.some(row => row.blocks.length) && <ul className={styles.legend} aria-label="Arti warna">
      {timelineLegend(true).map(item => <li key={item.label}><Pill tone={item.tone}>{item.label}</Pill></li>)}
    </ul>}

    <div className={styles.cols}>
      <Card title="Permintaan jadwal" id="permintaan" action={{ label: "Lihat semua", href: praWamPath.requests }}>
        {open.length === 0 ? <p className={styles.empty}>Tidak ada permintaan yang menunggu.</p> : <ul className={styles.miniList}>
          {open.slice(0, 4).map(request => <li key={request.id} className={styles.miniRow}>
            <Avatar name={request.requester} size={36} />
            <span className={styles.miniText}>
              <strong>{request.requester}</strong>
              <span>Ganti jadwal · {request.sessionTitle}</span>
              <small>Diminta {spanLabel(request.toStartsAt, request.toEndsAt)} · diajukan {submitted(request.createdAt)}</small>
            </span>
            <Pill tone={request.stillCurrent ? "warn" : "bad"}>{request.stillCurrent ? "Menunggu" : "Jadwal berubah"}</Pill>
          </li>)}
        </ul>}
        {open.length > 4 && <p className={styles.empty}>dan {open.length - 4} permintaan lagi.</p>}
      </Card>

      <Card title="Kesiapan sesi" id="kesiapan" action={{ label: "Semua sesi", href: praWamPath.sessions }}>
        {data.upcoming.length === 0 ? <p className={styles.empty}>Belum ada sesi terbit mulai hari ini.</p> : <ul className={styles.readyList}>
          {data.upcoming.map(session => {
            const status = readiness(session, now);
            const started = !!session.startsAt && new Date(session.startsAt).getTime() - 30 * 60_000 <= now.getTime();
            const ended = !!session.endsAt && new Date(session.endsAt) <= now;
            return <li key={session.id} className={styles.readyRow}>
              <span className={styles.readyTime}>{session.startsAt ? clockLabel(wibTime(session.startsAt)) : "—"}{session.startsAt && wibDate(session.startsAt) !== today && <small>{dayLabel(wibDate(session.startsAt))}</small>}</span>
              <span className={styles.readyMain}>
                <a className={styles.cellLink} href={praWamPath.session(session.id)}>{session.title}</a>
                <small>{sessionWhere(session)} · {started ? `${session.present} / ${session.participantCount} hadir` : `${session.participantCount} peserta`}</small>
              </span>
              <span className={styles.readyEnd}>
                <Pill tone={status.tone}>{status.label}</Pill>
                {ended || session.booking
                  ? <ConsoleButtonLink href={praWamPath.sessionAttendance(session.id)}>Lihat absensi</ConsoleButtonLink>
                  : <ConsoleButtonLink href={praWamApi.sessionQr(session.id)} target="_blank" rel="noopener" icon={<QrCode size={16} aria-hidden />}>Cetak QR</ConsoleButtonLink>}
                <ConsoleButtonLink href={praWamPath.editSession(session.id)}>Ubah</ConsoleButtonLink>
              </span>
            </li>;
          })}
        </ul>}
      </Card>
    </div>

    {data.waiting.length > 0 && <Card title="Forum yang menunggu jam" id="berikutnya">
      <RowList>{data.waiting.map(session => <ListRow key={session.id} icon={<CalendarDays size={18} />} tone="neutral" title={session.title} sub={sessionWhen(session)}
        href={praWamPath.session(session.id)} trailing={<ChevronRight size={18} aria-hidden />} />)}</RowList>
    </Card>}
  </>;
}

/** A BOD reading the panitia's page (?lihat=panitia): as before, in the BOD's own frame. */
function BodReadView({ data, now }: { data: Overview; now: Date }) {
  const today = wibDate(now.toISOString());
  return <>
    <ScreenHead eyebrow={`WAM · ${longDate(now)}`} title="Ringkasan operasional" lead="Baca saja: kesiapan sesi dan kehadiran."
      actions={<a className="button button--secondary" href={praWamPath.dashboard}>Ringkasan BOD</a>} />
    {!data.migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}

    <div className={base.stats}>
      <div className={base.stat}><strong>{data.people}</strong><span>Karyawan aktif</span></div>
      <div className={base.stat}><strong>{data.todayExpected ? `${data.todayPresent} / ${data.todayExpected}` : "—"}</strong><span>Hadir di sesi hari ini</span></div>
      <a className={`${base.stat} ${data.openRequests ? base.statBrass : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
        <strong>{data.openRequests}</strong><span>Permintaan jadwal</span>
      </a>
      <div className={base.stat}><strong>{data.published} <small style={{ fontSize: 15 }}>terbit</small></strong><span>{data.drafts} draf menunggu jam</span></div>
    </div>

    <section className={base.card} aria-labelledby="kesiapan">
      <div className={styles.cardHead}><h2 id="kesiapan">Jadwal &amp; kesiapan sesi</h2><a href={praWamPath.sessions} className={base.meta}>Semua sesi</a></div>
      {data.upcoming.length === 0 ? <p className={base.meta}>Belum ada sesi terbit mulai hari ini.</p> : <div className={base.tableWrap}>
        <table className={base.table}>
          <thead><tr><th>Waktu</th><th>Sesi / lokasi</th><th>Peserta</th><th>Status</th></tr></thead>
          <tbody>{data.upcoming.map(session => <tr key={session.id}>
            <td><strong>{session.startsAt ? clockLabel(wibTime(session.startsAt)) : "—"}</strong>{session.startsAt && wibDate(session.startsAt) !== today && <small>{dayLabel(wibDate(session.startsAt))}</small>}</td>
            <td><a href={praWamPath.session(session.id)} style={{ color: "inherit", fontWeight: 700, textDecoration: "none" }}>{session.title}</a><small>{sessionWhere(session)}</small></td>
            <td>{session.startsAt && new Date(session.startsAt).getTime() - 30 * 60_000 <= now.getTime() ? `${session.present} / ${session.participantCount}` : `${session.participantCount} peserta`}</td>
            <td><SessionStatusPill session={session} now={now} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <div className={styles.twoCol}>
      <section className={base.card} aria-labelledby="berikutnya">
        <h2 id="berikutnya">Forum yang menunggu jam</h2>
        {data.waiting.length === 0 ? <p className={base.meta}>Semua forum sudah punya jadwal.</p> : data.waiting.map(session =>
          <a key={session.id} className={styles.rowLink} href={praWamPath.session(session.id)}>
            <span className={base.tile}><CalendarDays aria-hidden /></span>
            <span><strong>{session.title}</strong><small>{sessionWhen(session)}</small></span>
            <ChevronRight size={18} aria-hidden />
          </a>)}
      </section>
    </div>
  </>;
}
