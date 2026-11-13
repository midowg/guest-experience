import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle, ArrowLeftRight, BarChart3, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, Clock, DoorOpen,
  FileText, ListChecks, MapPin, Megaphone, UserCheck, UserX, Users, Video,
} from "lucide-react";
import { clockLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { methodLabels as checkInWayLabels } from "@/lib/pra-wam/attendance";
import { lowAttendance, percent, type AttentionKind } from "@/lib/pra-wam/bod";
import { sessionKindLabels } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import type { BodInsights } from "@/lib/server/pra-wam/bod-insights";
import type { BodSummary as Summary } from "@/lib/server/pra-wam/dashboard";
import type { Participation } from "@/lib/server/pra-wam/recap";
import base from "./pra-wam.module.css";
import styles from "./bod.module.css";

const ATTENDANCE_MIGRATION = "202611040005_pra_wam_attendance.sql";
const DEPARTMENTS_SHOWN = 8;

/** Each kind of "Perlu perhatian" item: its icon, and where one tap leads (none when BOD cannot open it). */
const attention: Record<AttentionKind, { icon: ReactNode; href?: string }> = {
  "low-attendance": { icon: <AlertTriangle aria-hidden />, href: praWamPath.people },
  requests: { icon: <ArrowLeftRight aria-hidden />, href: praWamPath.panitiaView },
  drafts: { icon: <CalendarClock aria-hidden />, href: praWamPath.sessions },
  "not-signed-in": { icon: <UserX aria-hidden />, href: praWamPath.people },
  deadline: { icon: <CalendarDays aria-hidden /> },
};

const shortDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const dayMonth = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const whenLabel = (iso: string, today: string) => {
  const date = wibDate(iso);
  return date === today ? "Hari ini" : `${shortDay(date)}, ${dayMonth(date)}`;
};
const hoursLabel = (hours: number) => `${hours.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`;

type Props = {
  data: Summary; insights: BodInsights; greeting: string; date: string;
  survey?: { name: string; participation: Participation } | null;
};

/**
 * Ringkasan for BOD (design system "Pra WAM · Hospitality", 6 Nov 2026), read only. The greeting
 * and phase, the forum on now in the blue card next to Perlu perhatian, eight summary tiles, then
 * attendance (per forum, per department), room use, app use, how people check in, what is next,
 * requests and HOD meetings, announcements and documents, and quick links.
 * Nothing is invented: a part without data says so.
 */
export function BodSummary({ data, insights, greeting, date, survey = null }: Props) {
  const notSignedIn = data.accounts - data.signedIn;
  const started = data.forums.filter(forum => forum.expected > 0);
  const average = data.attendanceReady && started.length ? percent(started.reduce((sum, forum) => sum + forum.present, 0), started.reduce((sum, forum) => sum + forum.expected, 0)) : null;
  const thisWeek = insights.rooms?.days.slice(5, 10) ?? [];
  const weekHours = thisWeek.reduce((sum, day) => sum + day.hours, 0);
  const weekUses = thisWeek.reduce((sum, day) => sum + day.bookings + day.sessions, 0);
  const phase = insights.phase;

  return <div className={styles.page}>
    <header className={styles.intro}>
      <div>
        <p className={styles.eyebrow}>{phase ? `${phase.name}${phase.day && phase.days ? ` · hari ke-${phase.day} dari ${phase.days}` : ""}` : "Ringkasan BOD"}</p>
        <h1>{greeting}</h1>
        <p className={styles.lead}>{date} · data langsung · akses baca saja</p>
      </div>
      <div className={styles.scope} aria-label="Cakupan data">
        <span className={styles.scopePill}>Semua departemen</span>
        <span className={styles.scopePill}>Semua BU</span>
        {phase?.daysToWam != null && <span className={`${styles.scopePill} ${styles.scopeBrass}`}><CalendarDays aria-hidden />WAM {phase.daysToWam === 0 ? "hari ini" : `${phase.daysToWam} hari lagi`}</span>}
      </div>
    </header>

    <div className={styles.top}>
      <ForumHero data={data} insights={insights} />
      <section className={`${base.card} ${styles.attention}`} aria-labelledby="perhatian">
        <div className={styles.cardHead}><h2 id="perhatian">Perlu perhatian</h2>{data.attention.length > 0 && <span className={styles.countPill}>{data.attention.length}</span>}</div>
        {data.attention.length === 0
          ? <p className={styles.allClear}><CheckCircle2 aria-hidden />Tidak ada yang perlu perhatian saat ini.</p>
          : <ul>{data.attention.map(item => {
            const { icon, href } = attention[item.kind];
            const body = <><span className={`${styles.attentionIcon} ${item.kind === "deadline" ? styles.iconInfo : ""}`}>{icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span>{href && <ChevronRight className={styles.chevron} aria-hidden />}</>;
            return <li key={item.kind}>{href ? <a className={styles.attentionRow} href={href}>{body}</a> : <div className={styles.attentionRow}>{body}</div>}</li>;
          })}</ul>}
      </section>
    </div>

    <ul className={styles.tiles} aria-label="Angka utama">
      <Tile value={data.people} label="Peserta" note={`${data.departments} departemen${data.businessUnits || insights.businessUnits.length ? ` · ${data.businessUnits || insights.businessUnits.length} BU` : ""}`} href={praWamPath.people} dot="var(--bod-c1)" />
      <Tile value={data.accounts ? `${data.signedIn}/${data.accounts}` : "—"} label="Akun pernah masuk" note={data.accounts === 0 ? "Akun belum dibuat" : notSignedIn > 0 ? `${notSignedIn} belum pernah masuk` : "Semua sudah masuk"} href={praWamPath.people} dot="var(--bod-c2)" />
      <Tile value={insights.signedInWeek} label="Aktif 7 hari" note={data.accounts ? `${percent(insights.signedInWeek, data.accounts)}% dari akun aktif` : "Belum ada akun"} dot="var(--bod-c3)" />
      <Tile value={average === null ? "—" : `${average}%`} label="Rata-rata hadir forum" note={!data.attendanceReady ? "Absen belum aktif" : started.length ? `${started.length} forum sudah berjalan` : "Belum ada forum berjalan"} dot="var(--bod-c4)" />
      <Tile value={data.published} label="Sesi terbit" note={data.drafts ? `${data.drafts} draf menunggu jam` : "Tidak ada draf"} href={praWamPath.sessions} dot="var(--bod-c1)" />
      <Tile value={insights.rooms ? hoursLabel(weekHours) : "—"} label="Ruang terpakai minggu ini" note={insights.rooms ? `${weekUses} booking dan sesi` : "Jadwal ruang belum tersedia"} href={praWamPath.appraisal()} dot="var(--bod-c2)" />
      <Tile value={insights.documents?.total ?? "—"} label="Dokumen" note={insights.documents ? `${insights.documents.general} umum · ${insights.documents.perSession} materi sesi` : "Dokumen belum tersedia"} href={praWamPath.documents} dot="var(--bod-c3)" />
      <Tile value={survey ? `${percent(survey.participation.done, survey.participation.active)}%` : "—"} label="Kuesioner terisi" note={survey ? `${survey.participation.done} dari ${survey.participation.active} karyawan` : "Belum dibuka"} dot="var(--bod-c4)" />
    </ul>

    <div className={styles.grid}>
      <section className={`${base.card} ${styles.span7}`} aria-labelledby="per-forum">
        <div className={styles.cardHead}><h2 id="per-forum">Kehadiran per forum</h2>{data.people > 0 && <span>dari {data.people} peserta</span>}</div>
        <ForumBars data={data} />
      </section>

      <section className={`${base.card} ${styles.span5}`} aria-labelledby="per-departemen">
        <div className={styles.cardHead}><h2 id="per-departemen">Per departemen</h2><span>hadir di forum yang sudah berjalan</span></div>
        <Departments data={data} />
      </section>

      <section className={`${base.card} ${styles.span7}`} aria-labelledby="ruang">
        <div className={styles.cardHead}><h2 id="ruang">Pemakaian ruang</h2><span>3 minggu, Senin–Jumat</span></div>
        <RoomUseChart insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span5}`} aria-labelledby="ruang-tersibuk">
        <div className={styles.cardHead}><h2 id="ruang-tersibuk">Ruang tersibuk</h2><a href={praWamPath.appraisal()}>Buka Book</a></div>
        <BusiestRooms insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span6}`} aria-labelledby="adopsi">
        <div className={styles.cardHead}><h2 id="adopsi">Pemakaian aplikasi per departemen</h2><span>pernah masuk / peserta</span></div>
        <Adoption insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span6}`} aria-labelledby="cara-absen">
        <div className={styles.cardHead}><h2 id="cara-absen">Cara absen</h2>{insights.checkIns && <span>{insights.checkIns.reduce((sum, item) => sum + item.count, 0)} absen tercatat</span>}</div>
        <CheckInMix insights={insights} />
        <div className={styles.subHead}><h3>Sesi per jenis</h3><a href={praWamPath.sessions}>Semua sesi</a></div>
        <SessionKinds insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span5} ${styles.agendaCard}`} aria-labelledby="berikutnya">
        <div className={styles.cardHead}><h2 id="berikutnya">Agenda berikutnya</h2><a href={praWamPath.sessions}>Lihat jadwal</a></div>
        <Upcoming insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span4}`} aria-labelledby="alur">
        <div className={styles.cardHead}><h2 id="alur">Permintaan &amp; Meeting HOD</h2></div>
        <Flows insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span3}`} aria-labelledby="survei">
        <div className={styles.cardHead}><h2 id="survei">Kuesioner</h2></div>
        {survey
          ? <><p className={styles.surveyName}>{survey.name}</p><Meter value={survey.participation.done} of={survey.participation.active} label={`${survey.participation.done} dari ${survey.participation.active} selesai`} /></>
          : <p className={styles.empty}>Belum ada kuesioner. Partisipasinya muncul di sini setelah dibuka.</p>}
      </section>

      <section className={`${base.card} ${styles.span6}`} aria-labelledby="pengumuman">
        <div className={styles.cardHead}><h2 id="pengumuman">Pengumuman panitia</h2></div>
        <Announcements insights={insights} />
      </section>

      <section className={`${base.card} ${styles.span6}`} aria-labelledby="dokumen">
        <div className={styles.cardHead}><h2 id="dokumen">Dokumen terbaru</h2><a href={praWamPath.documents}>Semua dokumen</a></div>
        <Documents insights={insights} />
      </section>

      {insights.businessUnits.length > 0 && <section className={`${base.card} ${styles.span12}`} aria-labelledby="per-bu">
        <div className={styles.cardHead}><h2 id="per-bu">Per business unit</h2><span>peserta dan yang pernah masuk</span></div>
        <ul className={styles.buList}>{insights.businessUnits.map(unit => <li key={unit.name}>
          <strong>{unit.name}</strong><span className={styles.buCount}>{unit.people}<small>peserta</small></span>
          <Meter value={unit.signedIn} of={unit.people} label={`${unit.signedIn} pernah masuk`} />
        </li>)}</ul>
      </section>}
    </div>

    <nav className={styles.quick} aria-label="Akses cepat">
      <a className={styles.quickItem} href={praWamPath.people}><span className={styles.quickIcon}><Users aria-hidden /></span><span>Semua peserta<small>per departemen dan BU</small></span><ChevronRight className={styles.chevron} aria-hidden /></a>
      <a className={styles.quickItem} href={praWamPath.panitiaView}><span className={styles.quickIcon}><BarChart3 aria-hidden /></span><span>Dashboard panitia<small>baca saja</small></span><ChevronRight className={styles.chevron} aria-hidden /></a>
    </nav>
  </div>;
}

/** Ubin ringkasan (DS "Daftar dan kartu"): a big number, a wave, one dot naming the kind, and a tap through. */
function Tile({ value, label, note, href, dot }: { value: ReactNode; label: string; note: string; href?: string; dot: string }) {
  const body = <>
    <span className={styles.tileTop}><strong>{value}</strong><Wave /></span>
    <span className={styles.tileLabel}><i style={{ background: dot }} aria-hidden />{label}{href && <ChevronRight aria-hidden />}</span>
    <small>{note}</small>
  </>;
  return <li>{href ? <a className={styles.tile} href={href}>{body}</a> : <div className={styles.tile}>{body}</div>}</li>;
}

function Wave() {
  return <svg className={styles.wave} viewBox="0 0 48 16" aria-hidden><path d="M1 9c4 0 4-6 8-6s4 10 8 10 4-10 8-10 4 10 8 10 4-6 8-6 4 4 6 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

/** A thin meter with its words beside it (never colour alone). */
function Meter({ value, of, label, warn }: { value: number; of: number; label: string; warn?: boolean }) {
  const share = percent(value, of);
  return <span className={styles.meter}>
    <span className={styles.track} role="img" aria-label={`${label}, ${share} persen`}><span className={`${styles.fill} ${warn ? styles.fillWarn : ""}`} style={{ width: `${share}%` }} /></span>
    <span className={styles.meterValue}>{share}%</span>
  </span>;
}

/** The blue card: the forum running now (or the last one), its attendance, and what comes next. */
function ForumHero({ data, insights }: { data: Summary; insights: BodInsights }) {
  const active = data.active;
  const next = insights.upcoming.find(session => session.id !== active?.id && new Date(session.startsAt) > new Date(`${insights.today}T00:00:00+07:00`));
  const nextLine = next && <p className={styles.heroNext}><CalendarDays aria-hidden /><span>Berikutnya · <strong>{next.title}</strong> · {whenLabel(next.startsAt, insights.today)}, {clockLabel(wibTime(next.startsAt))}</span></p>;
  if (!active) return <section className={`${base.hero} ${styles.hero}`} aria-label="Forum">
    <span className={styles.heroPill}>Forum</span>
    <h2>Belum ada forum yang berjalan</h2>
    <p className={styles.heroNote}>{data.published ? `${data.published} sesi sudah terbit. Kehadiran muncul di sini begitu forum pertama dimulai.` : "Panitia sedang menyusun jadwal."}</p>
    {nextLine}
  </section>;
  const share = percent(active.present, active.expected);
  return <section className={`${base.hero} ${styles.hero}`} aria-label={active.live ? "Forum berlangsung" : "Forum terakhir"}>
    <div className={styles.heroTop}>
      <span className={styles.heroPill}>{active.live ? "Sedang berlangsung" : "Forum terakhir"}</span>
      <span><Clock aria-hidden />{whenLabel(active.startsAt, insights.today)}, {clockLabel(wibTime(active.startsAt))}</span>
    </div>
    <h2><a href={praWamPath.session(active.id)}>{active.title}</a></h2>
    {data.attendanceReady ? <>
      <p className={styles.heroBig}><strong>{share}%</strong><span>hadir</span></p>
      <span className={styles.heroTrack} role="img" aria-label={`${active.present} dari ${active.expected} hadir`}><span style={{ width: `${share}%` }} /></span>
      <dl className={styles.heroStats}>
        <div><dt>Hadir</dt><dd>{active.present}</dd></div>
        <div><dt>{active.live ? "Belum absen" : "Tidak hadir"}</dt><dd>{Math.max(0, active.expected - active.present)}</dd></div>
        <div><dt>Diundang</dt><dd>{active.expected}</dd></div>
      </dl>
    </> : <p className={styles.heroNote}>Absen belum aktif (menunggu migrasi {ATTENDANCE_MIGRATION}).</p>}
    {nextLine}
    <a className={styles.heroLink} href={praWamPath.session(active.id)}>Lihat sesi <ChevronRight aria-hidden /></a>
  </section>;
}

/** Attendance per started forum as meters, labelled with the count; brass (and the word) for the one running now. */
function ForumBars({ data }: { data: Summary }) {
  if (!data.migrated) return <p className={styles.empty}>Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</p>;
  if (data.forums.length === 0) return <p className={styles.empty}>Belum ada forum yang dimulai. Angka muncul setelah forum pertama berjalan.</p>;
  if (!data.attendanceReady) return <>
    <p className={styles.empty}>Absen belum aktif (menunggu migrasi {ATTENDANCE_MIGRATION}), jadi kehadiran belum bisa dihitung.</p>
    <ul className={styles.plainList}>{data.forums.map(forum => <li key={forum.id}><a href={praWamPath.session(forum.id)}>{forum.title}</a><span>{forum.expected} peserta</span></li>)}</ul>
  </>;
  return <>
    <ul className={styles.bars}>
      {data.forums.map(forum => {
        const share = percent(forum.present, forum.expected);
        return <li key={forum.id}>
          <a className={styles.bar} href={praWamPath.session(forum.id)} data-tip={`${forum.present} dari ${forum.expected} hadir · ${share}%`}>
            <span className={styles.barName}>{forum.title}<small>{forum.live ? "Berlangsung" : `${dayMonth(wibDate(forum.startsAt))} · ${forum.expected} diundang`}</small></span>
            <span className={styles.track} aria-hidden><span className={`${styles.fill} ${forum.live ? styles.fillLive : ""}`} style={{ width: `${share}%` }} /></span>
            <strong className={styles.barValue}>{share}%<small>{forum.present}/{forum.expected}</small></strong>
          </a>
        </li>;
      })}
    </ul>
    {data.forums.some(forum => forum.live) && <p className={styles.note}>Bilah kuning: forum yang sedang berlangsung.</p>}
  </>;
}

/** Attendance per department with its lead; the first eight, the rest on the Peserta page. */
function Departments({ data }: { data: Summary }) {
  if (data.units.length === 0) return <p className={styles.empty}>Belum ada data departemen. Unit dan jabatan diimpor super admin di halaman Data karyawan.</p>;
  const shown = data.units.slice(0, DEPARTMENTS_SHOWN);
  return <>
    <ul className={styles.deptList}>{shown.map(unit => {
      const low = data.attendanceReady && lowAttendance(unit);
      return <li key={unit.id}>
        <span className={styles.deptName}><strong>{unit.name}</strong><small>{unit.members} orang · {unit.leads.length ? `Lead ${unit.leads.join(", ")}` : "Lead belum ditentukan"}</small></span>
        {data.attendanceReady && unit.expected
          ? <span className={styles.deptValue}>
            <Meter value={unit.present} of={unit.expected} label={`${unit.present} dari ${unit.expected}`} warn={low} />
            {low && <span className={styles.warnTag}><AlertTriangle aria-hidden />di bawah 50%</span>}
          </span>
          : <span className={styles.muted}>Belum ada forum</span>}
      </li>;
    })}</ul>
    <p className={styles.tableFoot}>
      <span>Menampilkan {shown.length} dari {data.units.length} departemen</span>
      {data.units.length > shown.length && <a href={praWamPath.people}>Lihat semua</a>}
    </p>
  </>;
}

/** 15 office days as columns: bookings and sessions stacked, today marked, hours on hover. */
function RoomUseChart({ insights }: { insights: BodInsights }) {
  const rooms = insights.rooms;
  if (!rooms) return <p className={styles.empty}>Jadwal ruang belum bisa dibaca.</p>;
  const top = Math.max(1, ...rooms.days.map(day => day.bookings + day.sessions));
  return <>
    <div className={styles.columns} role="img" aria-label={`Pemakaian ruang 15 hari kerja: ${rooms.total} booking dan sesi, ${hoursLabel(rooms.hours)}`}>
      {rooms.days.map(day => {
        const total = day.bookings + day.sessions;
        const today = day.date === insights.today;
        return <div key={day.date} className={`${styles.column} ${today ? styles.columnToday : ""}`} data-tip={`${shortDay(day.date)} ${dayMonth(day.date)}: ${day.bookings} booking, ${day.sessions} sesi · ${hoursLabel(day.hours)}`} tabIndex={0}>
          <span className={styles.columnValue}>{total || ""}</span>
          <span className={styles.columnStack} style={{ height: `${(total / top) * 100}%` } as CSSProperties}>
            {day.sessions > 0 && <span className={styles.stackSession} style={{ flexGrow: day.sessions }} />}
            {day.bookings > 0 && <span className={styles.stackBooking} style={{ flexGrow: day.bookings }} />}
          </span>
          <span className={styles.columnDay}><span className={styles.dayLong}>{shortDay(day.date).slice(0, 3)}</span><span className={styles.dayShort} aria-hidden>{shortDay(day.date).slice(0, 1)}</span><small>{Number(day.date.slice(8))}</small></span>
        </div>;
      })}
    </div>
    <ul className={styles.legend}>
      <li><i style={{ background: "var(--bod-c1)" }} aria-hidden />Booking ruang</li>
      <li><i style={{ background: "var(--bod-c2)" }} aria-hidden />Sesi panitia</li>
      <li><i className={styles.legendToday} aria-hidden />Hari ini</li>
      <li className={styles.legendTotal}>{rooms.total} pemakaian · {hoursLabel(rooms.hours)}{rooms.outside ? ` · ${rooms.outside} di luar kantor` : ""}</li>
    </ul>
  </>;
}

function BusiestRooms({ insights }: { insights: BodInsights }) {
  const rooms = insights.rooms;
  if (!rooms) return <p className={styles.empty}>Jadwal ruang belum bisa dibaca.</p>;
  if (rooms.rooms.length === 0) return <p className={styles.empty}>Belum ada ruang yang dipakai dalam 3 minggu ini.</p>;
  const top = Math.max(...rooms.rooms.map(room => room.hours), 1);
  return <ul className={styles.rankList}>{rooms.rooms.slice(0, 6).map((room, index) => <li key={room.id}>
    <span className={styles.rank}>{index + 1}</span>
    <span className={styles.rankName}><strong>{room.name}</strong><small>{room.uses} kali dipakai</small></span>
    <span className={styles.rankBar} aria-hidden><span style={{ width: `${(room.hours / top) * 100}%` }} /></span>
    <strong className={styles.rankValue}>{hoursLabel(room.hours)}</strong>
  </li>)}</ul>;
}

function Adoption({ insights }: { insights: BodInsights }) {
  if (insights.adoption.length === 0) return <p className={styles.empty}>Belum ada data departemen.</p>;
  return <ul className={styles.deptList}>{insights.adoption.slice(0, 8).map(row => <li key={row.name}>
    <span className={styles.deptName}><strong>{row.name}</strong><small>{row.signedIn} dari {row.people} pernah masuk{row.accounts < row.people ? ` · ${row.people - row.accounts} tanpa akun` : ""}</small></span>
    <span className={styles.deptValue}><Meter value={row.signedIn} of={row.people} label={`${row.signedIn} dari ${row.people} pernah masuk`} warn={percent(row.signedIn, row.people) < 50} /></span>
  </li>)}</ul>;
}

const wayColor = { qr: "var(--bod-c1)", offline: "var(--bod-c2)", online: "var(--bod-c3)", manual: "var(--bod-c4)" } as const;
const wayIcon = { qr: <UserCheck aria-hidden />, offline: <DoorOpen aria-hidden />, online: <Video aria-hidden />, manual: <ListChecks aria-hidden /> } as const;

/** One stacked bar of how the check-ins were made, with every way named and counted below it. */
function CheckInMix({ insights }: { insights: BodInsights }) {
  const mix = insights.checkIns;
  if (!mix) return <p className={styles.empty}>Absen belum aktif (menunggu migrasi {ATTENDANCE_MIGRATION}).</p>;
  const total = mix.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <p className={styles.empty}>Belum ada absen tercatat.</p>;
  return <>
    <div className={styles.stackBar} role="img" aria-label={mix.map(item => `${checkInWayLabels[item.way]} ${item.count}`).join(", ")}>
      {mix.filter(item => item.count).map(item => <span key={item.way} style={{ flexGrow: item.count, background: wayColor[item.way] }} data-tip={`${checkInWayLabels[item.way]}: ${item.count} (${percent(item.count, total)}%)`} />)}
    </div>
    <ul className={styles.mixList}>{mix.map(item => <li key={item.way}>
      <i style={{ background: wayColor[item.way] }} aria-hidden />{wayIcon[item.way]}<span>{checkInWayLabels[item.way]}</span><strong>{item.count}</strong><small>{percent(item.count, total)}%</small>
    </li>)}</ul>
  </>;
}

function SessionKinds({ insights }: { insights: BodInsights }) {
  const rows = insights.sessions.filter(row => row.published + row.drafts + row.cancelled > 0);
  if (rows.length === 0) return <p className={styles.empty}>Belum ada sesi buatan panitia.</p>;
  return <ul className={styles.kindList}>{rows.map(row => <li key={row.kind}>
    <strong>{sessionKindLabels[row.kind]}</strong>
    <span className={`${styles.status} ${styles.statusSuccess}`}><CheckCircle2 aria-hidden />{row.published} terbit</span>
    {row.drafts > 0 && <span className={`${styles.status} ${styles.statusWarning}`}><CalendarClock aria-hidden />{row.drafts} draf</span>}
    {row.cancelled > 0 && <span className={`${styles.status} ${styles.statusLine}`}>{row.cancelled} batal</span>}
  </li>)}</ul>;
}

/** Itinerary rows (DS "Agenda dan permintaan"): the time big on the left, then title, place and people. */
function Upcoming({ insights }: { insights: BodInsights }) {
  if (insights.upcoming.length === 0) return <p className={styles.empty}>Belum ada sesi panitia yang terjadwal ke depan.</p>;
  return <ul className={styles.agenda}>{insights.upcoming.map(session => <li key={session.id}>
    <a href={praWamPath.session(session.id)}>
      <span className={styles.agendaTime}><strong>{clockLabel(wibTime(session.startsAt))}</strong><small>{whenLabel(session.startsAt, insights.today)}</small></span>
      <span className={styles.agendaMain}>
        <strong>{session.title}</strong>
        <small>{session.where && <><MapPin aria-hidden />{session.where} · </>}{session.participants} peserta · {sessionKindLabels[session.kind]}</small>
      </span>
      <ChevronRight className={styles.chevron} aria-hidden />
    </a>
  </li>)}</ul>;
}

function Flows({ insights }: { insights: BodInsights }) {
  const { requests, hod } = insights;
  if (!requests && !hod) return <p className={styles.empty}>Belum ada data permintaan.</p>;
  return <div className={styles.flows}>
    {requests && <div>
      <h3>Ganti jadwal</h3>
      <dl className={styles.flowNumbers}>
        <div className={requests.open ? styles.flowWarn : undefined}><dt>Menunggu</dt><dd>{requests.open}</dd></div>
        <div><dt>Disetujui</dt><dd>{requests.approved}</dd></div>
        <div><dt>Ditolak</dt><dd>{requests.rejected}</dd></div>
      </dl>
    </div>}
    {hod && <div>
      <h3>Meeting HOD</h3>
      <dl className={styles.flowNumbers}>
        <div className={hod.waiting ? styles.flowWarn : undefined}><dt>Menunggu</dt><dd>{hod.waiting}</dd></div>
        <div><dt>Terjadwal</dt><dd>{hod.scheduled}</dd></div>
        <div><dt>Ditolak</dt><dd>{hod.rejected}</dd></div>
      </dl>
    </div>}
  </div>;
}

function Announcements({ insights }: { insights: BodInsights }) {
  const info = insights.announcements;
  if (!info) return <p className={styles.empty}>Pengumuman belum tersedia.</p>;
  if (info.sent === 0) return <p className={styles.empty}>Panitia belum mengirim pengumuman.</p>;
  return <div className={styles.announce}>
    <div className={styles.announceNumbers}>
      <span><strong>{info.sent}</strong><small>terkirim</small></span>
      <span><strong>{percent(info.read, info.recipients)}%</strong><small>rata-rata dibaca</small></span>
    </div>
    {info.latest && <div className={styles.latest}>
      <span className={styles.latestIcon}><Megaphone aria-hidden /></span>
      <span className={styles.latestText}><strong>{info.latest.title}</strong><small>Terakhir · {whenLabel(info.latest.at, insights.today)}</small>
        <Meter value={info.latest.read} of={info.latest.recipients} label={`${info.latest.read} dari ${info.latest.recipients} sudah membaca`} />
      </span>
    </div>}
  </div>;
}

function Documents({ insights }: { insights: BodInsights }) {
  const docs = insights.documents;
  if (!docs) return <p className={styles.empty}>Dokumen belum tersedia.</p>;
  if (docs.recent.length === 0) return <p className={styles.empty}>Belum ada dokumen.</p>;
  return <ul className={styles.docList}>{docs.recent.map(doc => <li key={doc.id}>
    <span className={styles.latestIcon}><FileText aria-hidden /></span>
    <span className={styles.latestText}><strong>{doc.title}</strong><small>{[doc.session ?? "Dokumen umum", doc.by, whenLabel(doc.at, insights.today)].join(" · ")}</small></span>
  </li>)}</ul>;
}
