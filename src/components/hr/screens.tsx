"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileText, LifeBuoy, MapPin, Palette, Plus, ScanFace, ShieldCheck } from "lucide-react";
import {
  clockMethodLabels, faceStatusLabels, flagLabels, kindLabels, nextKind, reasonLabels, REQUEST_DAYS, requestStatusLabels, requestSummary, requestTypeLabels, statusLabels, type AttendanceRequest, type ClockInState, type DailyKind, type DailyRecord, type FaceStatus,
} from "@/lib/hr/attendance";
import { distanceLabel } from "@/lib/hr/geo";
import { THEMES, themeLabels, type Theme } from "@/lib/hr/theme";
import { covers, leaveDays, leaveLabels, leaveStatusLabels, leaveSummary, spanLabel, type LeaveRequest } from "@/lib/hr/leave";
import { matchPercent } from "@/lib/hr/face-match";
import { byWeek, durationLabel, historySummary, minuteOfDay, minutesByDate, shiftDate, weekOf, workedMinutes } from "@/lib/hr/history";
import { instantLabel, zoneDate, zoneSuffix, zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";
import { DayLine, Detail, Empty, Group, initials, LargeHead, RowButton, RowInfo, Segmented, SrOnly, StatusWord, Ticket } from "./ui";
import { WgMark } from "./WgMark";
import styles from "./app.module.css";

/*
 * WG People's screens (21 Nov 2026): the four tab roots and the detail screens they open. They only
 * show and ask; what happens (the camera, the server, the history) is in ClockInFlow. Rows that open
 * a detail carry a `mark`, so focus finds them again on the way back. Second look (same day): today
 * on Beranda is the time card (Ticket) with the day line; Riwayat draws each day on the line too.
 */

const say = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const longDay = (date: string) => say(date, { weekday: "long", day: "numeric", month: "long" });
const shortDay = (date: string) => say(date, { weekday: "long", day: "numeric", month: "short" });
const usable = (status: FaceStatus | undefined) => status === "aktif" || status === "menunggu" || status === "siap";
const recordsOf = (state: ClockInState, date: string) => ({
  masuk: state.recent.find(record => record.workDate === date && record.kind === "masuk") ?? null,
  pulang: state.recent.find(record => record.workDate === date && record.kind === "pulang") ?? null,
});
/** Where a record was made, in words (also the receipt after an absen). */
export const placeOf = (record: DailyRecord) => record.method === "manual" && !record.officeName && !record.reasonKind ? "Dicatat Admin HR"
  : record.reasonKind ? reasonLabels[record.reasonKind] : record.officeName ?? "Di luar kantor";
/** "Pagi" by the hour where the person is: Beranda says "Pagi, Rina", the way people greet at the door. */
export function greetingAt(iso: string, zone: ViewerZone): string {
  const hour = Number(zoneTime(iso, zone).slice(0, 2));
  return hour < 4 ? "Malam" : hour < 11 ? "Pagi" : hour < 15 ? "Siang" : hour < 18 ? "Sore" : "Malam";
}
/** Where a record sits on the day line, in the viewer's zone. */
const minuteOf = (record: DailyRecord | null, zone: ViewerZone) => (record ? minuteOfDay(record.at, zone) : null);
/** A day on the day line: masuk to pulang; masuk to now while still at work (today only); a pin when only one is there. */
function spanOf(masuk: DailyRecord | null, pulang: DailyRecord | null, zone: ViewerZone, nowMinute: number | null) {
  const start = minuteOf(masuk, zone) ?? minuteOf(pulang, zone);
  const end = masuk ? minuteOf(pulang, zone) ?? nowMinute : null;
  return { start, end };
}
/** The first record of a day that is not simply Sah, for its status word. */
const notSah = (...records: (DailyRecord | null)[]) => records.find(record => record && record.status !== "sah") ?? null;
const waitingOn = (state: ClockInState, date: string) => state.requests.filter(request => request.status === "menunggu" && request.workDate === date);
/** Within the days a revision may be asked for (the server's rule: today and the 31 days before). */
export const revisable = (state: ClockInState, date: string) => state.ready && date <= state.today.workDate && date >= shiftDate(state.today.workDate, -REQUEST_DAYS);
const clockOf = (record: DailyRecord | null, zone: ViewerZone) => (record ? instantLabel(record.at, zone) : null);

/* ── Beranda ─────────────────────────────────────────────────────────── */

export function HomeScreen({ state, now, zone, name, onClock, onDay, onRevise }: {
  state: ClockInState; now: string; zone: ViewerZone; name: string;
  onClock(kind: DailyKind): void; onDay(date: string): void; onRevise(date: string): void;
}) {
  const { masuk, pulang } = state.today;
  const next = nextKind(state.today);
  const today = state.today.workDate;
  const nowMinute = minuteOfDay(now, zone);
  const worked = masuk ? workedMinutes(masuk.at, pulang?.at ?? now) : 0;
  const line = !masuk && !pulang ? "Belum absen masuk hari ini."
    : masuk && !pulang ? (worked >= 8 * 60
      ? <>Sudah <span className={styles.live}>{durationLabel(worked)}</span>. Waktunya pulang?</>
      : <>Sudah bekerja <span className={styles.live}>{durationLabel(worked)}</span>.</>)
      : masuk && pulang ? <>Selesai, total <span className={styles.live}>{durationLabel(worked)}</span>. Sampai besok!</>
        : "Absen pulang sudah tercatat.";
  const span = spanOf(masuk, pulang, zone, pulang ? null : nowMinute);
  // Today's own cuti, sakit, izin or dinas (approved first), said on the card; absen stays possible (dinas often clocks in).
  const away = (state.leaves ?? []).filter(leave => (leave.status === "disetujui" || leave.status === "menunggu") && covers(leave, today))
    .sort((a, b) => (a.status === "disetujui" ? -1 : 0) - (b.status === "disetujui" ? -1 : 0))[0] ?? null;

  // What needs the person: a recent day with masuk but no pulang (and nothing asked yet), or a refused record.
  const earlier = [...new Set(state.recent.map(record => record.workDate))].filter(date => date < today && date >= shiftDate(today, -7)).sort().reverse();
  const forgot = earlier.find(date => { const day = recordsOf(state, date); return day.masuk && !day.pulang && !waitingOn(state, date).length; });
  const refused = state.recent.find(record => record.status === "ditolak" && record.workDate >= shiftDate(today, -7));

  const week = weekOf(today);
  const hours = minutesByDate(state.recent, week);
  const running = masuk && !pulang ? worked : 0;

  return <div className={styles.screen}>
    <LargeHead eyebrow={longDay(today)} title={<>{greetingAt(now, zone)}{name ? `, ${name}` : ""}</>} />

    {!state.ready
      ? <Empty icon={<Clock3 size={32} aria-hidden />} title="Absen harian belum dibuka">{state.waiting ?? "Admin HR sedang menyiapkannya."}</Empty>
      : <Ticket label="Absen hari ini" stub={<>
        <p className={styles.stubLabel}>Hari ini{away && <span className={styles.awayChip}>{leaveLabels[away.type]} · {away.status === "disetujui" ? "disetujui" : "menunggu"}</span>}</p>
        <p className={styles.clockLine}><time className={styles.clock} dateTime={now}>{instantLabel(now, zone)}</time><span className={styles.zone}>{zone}</span></p>
        <p className={styles.state}>{line}</p>
        <DayLine tone="brand" start={span.start} end={span.end} now={pulang ? null : nowMinute} labels />
        {next
          ? <button type="button" className={styles.action} onClick={() => onClock(next)}><ScanFace size={22} aria-hidden /> Absen {kindLabels[next].toLowerCase()}</button>
          : <p className={styles.done}><CheckCircle2 size={20} aria-hidden /> Absen hari ini lengkap</p>}
        {next && !usable(state.face?.status) && <p className={styles.hint}>Pertama kali: daftar wajah dulu, sekali saja.</p>}
      </>}>
        <ul className={styles.slots}>
          {([["masuk", masuk], ["pulang", pulang]] as const).map(([kind, record]) => <li key={kind} className={styles.slot} data-empty={!record || undefined}>
            <span className={styles.slotLabel}>{kindLabels[kind]}</span>
            {record ? <span className={styles.slotTime}>{instantLabel(record.at, zone)}{zoneSuffix(zone)}</span> : <span className={styles.slotEmpty}>Belum</span>}
            {record && <span className={styles.slotWhere}>{placeOf(record)}</span>}
            {record && record.status !== "sah" && <StatusWord tone={record.status}>{statusLabels[record.status]}</StatusWord>}
          </li>)}
        </ul>
        {next === "masuk" && <button type="button" className={`${styles.quiet} ${styles.quietMuted}`} onClick={() => onClock("pulang")}>Lupa absen masuk? Langsung absen pulang</button>}
      </Ticket>}

    {(forgot || refused) && <Group label="Perlu perhatian">
      {forgot && <RowButton title={`${shortDay(forgot)} belum ada absen pulang`} sub="Ajukan revisi supaya jam pulangmu tercatat." onClick={() => onRevise(forgot)} />}
      {refused && <RowButton mark={`hari-${refused.workDate}`} title={`Absen ${kindLabels[refused.kind].toLowerCase()} ${shortDay(refused.workDate)} ditolak`} sub={refused.reviewNote ?? "Lihat alasannya, lalu ajukan revisi bila perlu."} onClick={() => onDay(refused.workDate)} />}
    </Group>}

    <section className={styles.group} aria-labelledby="minggu-ini">
      <div className={styles.groupHead}>
        <h2 id="minggu-ini" className={styles.groupLabel}>Minggu ini</h2>
        {hours.total + running > 0 && <span className={styles.groupValue}>{durationLabel(hours.total + running)}</span>}
      </div>
      <div className={styles.week}>
        {week.map(date => {
          const day = recordsOf(state, date);
          const check = notSah(day.masuk, day.pulang);
          const mark = check ? "cek" : day.masuk && day.pulang ? "lengkap" : day.masuk || day.pulang ? "sebagian" : "kosong";
          const minutes = hours.byDate[date] ?? (date === today ? running : 0);
          const word = date > today ? "belum" : check ? statusLabels[check.status].toLowerCase() : { lengkap: "lengkap", sebagian: "belum lengkap", kosong: "tidak ada absen", cek: "" }[mark];
          return <button key={date} type="button" className={styles.day} disabled={date > today} aria-current={date === today ? "date" : undefined} data-mark={`hari-${date}`} onClick={() => onDay(date)}>
            <span className={styles.dayBar} aria-hidden><span className={styles.dayFill} style={{ height: `${Math.min(100, (minutes / 600) * 100)}%` }} /></span>
            <span className={styles.dayName} aria-hidden>{say(date, { weekday: "short" })}</span>
            <span className={styles.dayNumber} aria-hidden>{Number(date.slice(8))}</span>
            <span className={`${styles.mark} ${styles[`mark_${mark}`]}`} aria-hidden />
            <SrOnly>{longDay(date)}, {word}{minutes ? `, ${durationLabel(minutes)}` : ""}</SrOnly>
          </button>;
        })}
      </div>
      <p className={styles.groupNote} aria-hidden>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_lengkap}`} /> lengkap</span>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_sebagian}`} /> belum lengkap</span>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_cek}`} /> perlu dicek</span>
      </p>
    </section>
  </div>;
}

/* ── Riwayat ─────────────────────────────────────────────────────────── */

type Filter = "semua" | "cek" | "luar";
export function HistoryScreen({ state, zone, onDay }: { state: ClockInState; zone: ViewerZone; onDay(date: string): void }) {
  const [filter, setFilter] = useState<Filter>("semua");
  const dates = [...new Set(state.recent.map(record => record.workDate))];
  const isCheck = (date: string) => state.recent.some(record => record.workDate === date && record.status !== "sah");
  const isOut = (date: string) => state.recent.some(record => record.workDate === date && record.reasonKind);
  const shown = dates.filter(date => filter === "semua" || (filter === "cek" ? isCheck(date) : isOut(date)));
  const summary = historySummary(state.recent, zone);

  return <div className={styles.screen}>
    <LargeHead title="Riwayat" lead={`31 hari terakhir${summary.usualIn ? ` · biasanya masuk ${summary.usualIn}` : ""}`} />
    {dates.length > 0 && <Segmented<Filter> label="Saring riwayat" value={filter} onChange={setFilter} options={[
      { value: "semua", label: "Semua", count: dates.length, unit: "hari" },
      { value: "cek", label: "Perlu dicek", count: dates.filter(isCheck).length, unit: "hari" },
      { value: "luar", label: "Di luar", count: dates.filter(isOut).length, unit: "hari" },
    ]} />}
    {!dates.length && <Empty icon={<CalendarDays size={32} aria-hidden />} title="Belum ada absen">Absen pertamamu akan muncul di sini.</Empty>}
    {dates.length > 0 && !shown.length && <Empty title="Tidak ada">Tidak ada hari yang cocok dengan saringan ini.</Empty>}
    {byWeek(shown, state.today.workDate).map(week => <Group key={week.label} label={week.label}>
      {week.dates.map(date => {
        const { masuk, pulang } = recordsOf(state, date);
        const check = notSah(masuk, pulang);
        const waiting = waitingOn(state, date).length > 0;
        const first = masuk ?? pulang;
        const inAt = clockOf(masuk, zone), outAt = clockOf(pulang, zone);
        return <RowButton key={date} mark={`hari-${date}`} onClick={() => onDay(date)}
          lead={<span className={styles.date} aria-hidden><span className={styles.dateName}>{say(date, { weekday: "short" })}</span><span className={styles.dateNumber}>{Number(date.slice(8))}</span></span>}
          title={<span className={styles.times}>
            <SrOnly>{date === state.today.workDate ? "Hari ini, " : `${longDay(date)}, `}masuk </SrOnly>{inAt ?? <span className={styles.timesEmpty}>belum</span>}
            <span aria-hidden> → </span><SrOnly>, pulang </SrOnly>{outAt ?? <span className={styles.timesEmpty}>belum</span>}
          </span>}
          sub={<>
            <DayLine thin {...spanOf(masuk, pulang, zone, null)} />
            {date === state.today.workDate ? "Hari ini · " : ""}{first ? placeOf(first) : ""}{waiting ? " · revisi menunggu" : ""}
          </>}
          trailing={check ? <StatusWord tone={check.status}>{statusLabels[check.status]}</StatusWord> : masuk && !pulang && date < state.today.workDate ? <StatusWord tone="kosong">Belum pulang</StatusWord> : null} />;
      })}
    </Group>)}
  </div>;
}

/* ── Pengajuan ───────────────────────────────────────────────────────── */

type Asked = { kind: "revisi"; at: string; request: AttendanceRequest } | { kind: "cuti"; at: string; leave: LeaveRequest };
/** Pengajuan: revisions and cuti/sakit/izin/dinas together, waiting ones first, newest first. */
export function RequestsScreen({ state, onNew, onOpen, onOpenLeave }: { state: ClockInState; onNew(): void; onOpen(id: string): void; onOpenLeave(id: string): void }) {
  const [part, setPart] = useState<"menunggu" | "selesai">("menunggu");
  const all: Asked[] = [
    ...state.requests.map(request => ({ kind: "revisi" as const, at: request.createdAt, request })),
    ...(state.leaves ?? []).map(leave => ({ kind: "cuti" as const, at: leave.createdAt, leave })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const waits = (item: Asked) => (item.kind === "revisi" ? item.request.status : item.leave.status) === "menunggu";
  const waiting = all.filter(waits);
  const finished = all.filter(item => !waits(item));
  const shown = part === "menunggu" ? waiting : finished;
  return <div className={styles.screen}>
    <LargeHead title="Pengajuan" action={state.ready ? <button type="button" className={styles.headAction} onClick={onNew}><Plus size={18} aria-hidden /> Ajukan</button> : null} />
    <Segmented<"menunggu" | "selesai"> label="Status pengajuan" value={part} onChange={setPart} options={[
      { value: "menunggu", label: "Menunggu", count: waiting.length },
      { value: "selesai", label: "Selesai", count: finished.length },
    ]} />
    {shown.length
      ? <Group>{shown.slice(0, 40).map(item => item.kind === "revisi"
        ? <RowButton key={`r-${item.request.id}`} mark={`pengajuan-${item.request.id}`} onClick={() => onOpen(item.request.id)}
          title={requestSummary(item.request)} sub={`Revisi · ${requestTypeLabels[item.request.type]} · ${shortDay(item.request.workDate)}`}
          trailing={<StatusWord tone={item.request.status}>{requestStatusLabels[item.request.status]}</StatusWord>} />
        : <RowButton key={`c-${item.leave.id}`} mark={`cuti-${item.leave.id}`} onClick={() => onOpenLeave(item.leave.id)}
          lead={<span className={styles.teamAvatar} data-type={item.leave.type} aria-hidden>{leaveLabels[item.leave.type].slice(0, 1)}</span>}
          title={`${leaveLabels[item.leave.type]} · ${spanLabel(item.leave.startDate, item.leave.endDate)}`} sub={`${leaveDays(item.leave.startDate, item.leave.endDate)} hari`}
          trailing={<StatusWord tone={item.leave.status}>{leaveStatusLabels[item.leave.status]}</StatusWord>} />)}</Group>
      : part === "menunggu"
        ? <Empty icon={<FileText size={32} aria-hidden />} title="Tidak ada yang menunggu">Mau cuti, izin, dinas, atau ada absen yang salah? Tekan Ajukan.</Empty>
        : <Empty icon={<FileText size={32} aria-hidden />} title="Belum ada yang selesai">Pengajuan yang sudah diputuskan Admin HR muncul di sini.</Empty>}
  </div>;
}

/* ── Profil ──────────────────────────────────────────────────────────── */

export function ProfileScreen({ state, fullName, zone, theme, onTheme, onFace, onHelp, onSignOut }: {
  state: ClockInState; fullName: string; zone: ViewerZone; theme: Theme; onTheme(theme: Theme): void; onFace(): void; onHelp(): void; onSignOut(): void;
}) {
  return <div className={styles.screen}>
    <header className={styles.idCard}>
      <p className={styles.idBrand}><WgMark size={22} head="var(--hr-on-brand)" aria-hidden /> WG People</p>
      <span className={styles.avatar} aria-hidden>{initials(fullName)}</span>
      <div className={styles.headText}>
        <h1 className={styles.personName}>{fullName}</h1>
        <p className={styles.idSub}>Akun WAM · wajah {state.face ? faceStatusLabels[state.face.status].toLowerCase() : "belum terdaftar"}</p>
      </div>
    </header>
    {/* Only what is changed or looked at often (21 Nov 2026, the owner's ask); the rest is in Bantuan & FAQ. */}
    <Group label="Absen" icons>
      <RowButton mark="wajah" icon={<ShieldCheck size={20} />} title="Data wajah" value={state.face ? faceStatusLabels[state.face.status] : "Belum terdaftar"} onClick={onFace} />
    </Group>
    <Group label="Pengaturan" icons>
      <li><div className={`${styles.row} ${styles.info}`}>
        <span className={styles.rowIcon} aria-hidden><Palette size={20} /></span>
        <span className={styles.rowText}><span className={styles.rowTitle}>Tampilan</span></span>
        <span className={styles.rowControl}><Segmented<Theme> label="Tampilan" value={theme} onChange={onTheme} options={THEMES.map(value => ({ value, label: themeLabels[value] }))} /></span>
      </div></li>
      <RowInfo icon={<Clock3 size={20} />} title="Zona waktu" value={zone} sub="Mengikuti HP-mu" />
    </Group>
    <Group icons>
      <RowButton mark="bantuan" icon={<LifeBuoy size={20} />} title="Bantuan & FAQ" sub="Cara absen, titik kantor, revisi, cuti, data wajah" onClick={onHelp} />
    </Group>
    <Group><RowButton title="Keluar" danger chevron={false} onClick={onSignOut} /></Group>
  </div>;
}

/* ── Detail: one day ─────────────────────────────────────────────────── */

export function DayDetail({ state, date, zone, onBack, onRevise, onRequest }: {
  state: ClockInState; date: string; zone: ViewerZone; onBack(): void; onRevise(date: string): void; onRequest(id: string): void;
}) {
  const day = recordsOf(state, date);
  const requests = state.requests.filter(request => request.workDate === date);
  const span = spanOf(day.masuk, day.pulang, zone, null);
  return <Detail title={shortDay(date)} onBack={onBack}
    action={revisable(state, date) ? <button type="button" className={styles.barText} onClick={() => onRevise(date)}>Revisi</button> : undefined}>
    <div className={styles.daySummary}>
      <p className={styles.daySummaryTimes}>
        {clockOf(day.masuk, zone) ?? <span className={styles.timesEmpty}>belum</span>}<span aria-hidden> → </span><SrOnly> sampai </SrOnly>{clockOf(day.pulang, zone) ?? <span className={styles.timesEmpty}>belum</span>}
      </p>
      <p className={styles.lead}>{day.masuk && day.pulang ? `${durationLabel(workedMinutes(day.masuk.at, day.pulang.at))} bekerja` : longDay(date)}</p>
      <DayLine {...span} labels />
    </div>
    {(["masuk", "pulang"] as const).map(kind => {
      const record = day[kind];
      return <Group key={kind} label={kindLabels[kind]}>
        {record ? <>
          <RowInfo title="Jam" value={`${instantLabel(record.at, zone)} ${zone}`} />
          <RowInfo title="Lokasi" value={placeOf(record)} sub={record.reasonText ?? (record.distanceM != null ? `${distanceLabel(record.distanceM)} dari titik kantor` : undefined)} />
          <RowInfo title="Cara" value={record.method === "manual" ? "Dicatat Admin HR" : record.faceMethod ? clockMethodLabels[record.faceMethod] : "Wajah"} />
          {record.faceScore != null && <RowInfo title="Kecocokan wajah" value={`${matchPercent(record.faceScore)}%`} />}
          <RowInfo title="Status" sub={record.flags.length ? record.flags.map(flag => flagLabels[flag]).join(", ") : undefined} trailing={<StatusWord tone={record.status}>{statusLabels[record.status]}</StatusWord>} />
          {record.reviewNote && <RowInfo title="Catatan Admin HR" sub={record.reviewNote} />}
        </> : <RowInfo title={`Tidak ada absen ${kindLabels[kind].toLowerCase()}`} sub={revisable(state, date) ? "Lupa? Tekan Revisi di atas." : undefined} />}
      </Group>;
    })}
    {requests.length > 0 && <Group label="Revisi">
      {requests.map(request => <RowButton key={request.id} mark={`pengajuan-${request.id}`} title={requestSummary(request)} trailing={<StatusWord tone={request.status}>{requestStatusLabels[request.status]}</StatusWord>} onClick={() => onRequest(request.id)} />)}
    </Group>}
  </Detail>;
}

/* ── Detail: one request ─────────────────────────────────────────────── */

const sentAt = (iso: string, zone: ViewerZone) => `${say(zoneDate(iso, zone), { day: "numeric", month: "short" })}, ${instantLabel(iso, zone)}${zoneSuffix(zone)}`;
export function RequestDetail({ request, zone, onBack, onCancel }: { request: AttendanceRequest; zone: ViewerZone; onBack(): void; onCancel(): void }) {
  const decided = request.status === "disetujui" ? { state: "ok", title: "Disetujui", sub: request.decidedLabel ? `Oleh ${request.decidedLabel}. Perubahan sudah diterapkan ke absenmu.` : "Perubahan sudah diterapkan ke absenmu." }
    : request.status === "ditolak" ? { state: "no", title: "Ditolak", sub: request.decidedLabel ? `Oleh ${request.decidedLabel}.` : "" }
      : request.status === "dibatalkan" ? { state: "off", title: "Dibatalkan", sub: "Kamu membatalkannya." }
        : { state: "now", title: "Menunggu Admin HR", sub: "Hasilnya muncul di sini." };
  return <Detail title="Revisi" onBack={onBack}>
    <div className={styles.summary}>
      <h2 className={styles.summaryTitle}>{requestSummary(request)}</h2>
      <p className={styles.lead}>{requestTypeLabels[request.type]} · {longDay(request.workDate)}</p>
    </div>
    <ol className={styles.steps} aria-label="Perjalanan pengajuan">
      <li className={styles.stepItem}><span className={styles.stepTitle}>Dikirim</span><span className={styles.stepSub}>{sentAt(request.createdAt, zone)}</span></li>
      <li className={styles.stepItem} data-state={decided.state}><span className={styles.stepTitle}>{decided.title}</span>{decided.sub && <span className={styles.stepSub}>{decided.sub}</span>}</li>
    </ol>
    <Group label="Alasanmu"><RowInfo title={<span className={styles.plainText}>{request.note}</span>} /></Group>
    {request.decisionNote && <Group label="Catatan Admin HR"><RowInfo title={<span className={styles.plainText}>{request.decisionNote}</span>} /></Group>}
    {request.status === "menunggu" && <Group><RowButton title="Batalkan pengajuan" danger chevron={false} onClick={onCancel} /></Group>}
  </Detail>;
}

/* ── Detail: one cuti, sakit, izin or dinas ────────────────────────────── */

export function LeaveDetail({ leave, zone, onBack, onCancel }: { leave: LeaveRequest; zone: ViewerZone; onBack(): void; onCancel(): void }) {
  const decided = leave.status === "disetujui" ? { state: "ok", title: "Disetujui", sub: leave.decidedLabel ? `Oleh ${leave.decidedLabel}. Sudah masuk kalender tim.` : "Sudah masuk kalender tim." }
    : leave.status === "ditolak" ? { state: "no", title: "Ditolak", sub: leave.decidedLabel ? `Oleh ${leave.decidedLabel}.` : "" }
      : leave.status === "dibatalkan" ? { state: "off", title: "Dibatalkan", sub: "Kamu membatalkannya." }
        : { state: "now", title: "Menunggu Admin HR", sub: "Tim sudah melihatnya di kalender sebagai menunggu." };
  return <Detail title={leaveLabels[leave.type]} onBack={onBack}>
    <div className={styles.summary}>
      <h2 className={styles.summaryTitle}>{leaveSummary(leave)}</h2>
      <p className={styles.lead}>{leave.startDate === leave.endDate ? longDay(leave.startDate) : `${longDay(leave.startDate)} – ${longDay(leave.endDate)}`}</p>
    </div>
    <ol className={styles.steps} aria-label="Perjalanan pengajuan">
      <li className={styles.stepItem}><span className={styles.stepTitle}>Dikirim</span><span className={styles.stepSub}>{sentAt(leave.createdAt, zone)}</span></li>
      <li className={styles.stepItem} data-state={decided.state}><span className={styles.stepTitle}>{decided.title}</span>{decided.sub && <span className={styles.stepSub}>{decided.sub}</span>}</li>
    </ol>
    <Group label="Keteranganmu" note="Hanya kamu dan Admin HR yang membacanya."><RowInfo title={<span className={styles.plainText}>{leave.note}</span>} /></Group>
    {leave.decisionNote && <Group label="Catatan Admin HR"><RowInfo title={<span className={styles.plainText}>{leave.decisionNote}</span>} /></Group>}
    {leave.status === "menunggu" && <Group><RowButton title="Batalkan pengajuan" danger chevron={false} onClick={onCancel} /></Group>}
    {leave.status === "disetujui" && <p className={styles.groupNote}>Rencana berubah? Minta Admin HR membatalkannya; tanggalnya lalu keluar dari kalender tim.</p>}
  </Detail>;
}

/* ── Detail: face data ───────────────────────────────────────────────── */

/** Each face status said plainly: a short title and what it means for absen. */
const faceStory: Record<FaceStatus | "kosong", { title: string; line: string }> = {
  aktif: { title: "Aktif", line: "Wajahmu siap dipakai. Setiap absen cukup dengan kamera depan." },
  menunggu: { title: "Menunggu Admin HR", line: "Wajahmu sudah terdaftar. Sampai disetujui, absenmu tetap tercatat dengan status Perlu dicek." },
  siap: { title: "Tinggal setuju", line: "Foto acuan dari HR sudah siap. Setujui pemakaiannya di absen pertamamu." },
  impor: { title: "Sedang disiapkan", line: "Admin HR sedang menyiapkan foto acuanmu. Sementara ini kamu bisa daftar wajah sendiri." },
  ditolak: { title: "Perlu daftar ulang", line: "Foto acuanmu belum bisa dipakai. Daftarkan wajahmu sekali lagi, sekitar satu menit." },
  kosong: { title: "Belum terdaftar", line: "Belum ada foto acuan untukmu dari HR. Daftarkan wajahmu sekali, sekitar satu menit." },
};
/**
 * Data wajah (rewritten 21 Nov 2026, the owner found it unclear and roundabout): the status and what
 * it means, the one action that fits, then three short parts: how it works, what is kept and for how
 * long, and the right to remove it.
 */
export function FaceDetail({ state, onBack, onEnroll, onWithdraw }: { state: ClockInState; onBack(): void; onEnroll(): void; onWithdraw(): void }) {
  const status = state.face?.status;
  const story = faceStory[status ?? "kosong"];
  return <Detail title="Data wajah" onBack={onBack}>
    <div className={styles.faceStatus} data-ok={status === "aktif" || undefined}>
      <span className={styles.faceStatusIcon} aria-hidden>{status === "aktif" ? <ShieldCheck size={26} /> : status === "menunggu" || status === "impor" ? <Clock3 size={26} /> : <ScanFace size={26} />}</span>
      <div className={styles.headText}>
        <h2 className={styles.summaryTitle}>{story.title}</h2>
        <p className={styles.lead}>{story.line}</p>
        {state.face && <p className={styles.faceSource}>{state.face.source === "greatday" ? "Foto acuan dari HR" : "Didaftarkan sendiri di WG People"}</p>}
      </div>
    </div>
    {state.ready && !usable(status) && <button type="button" className={styles.wide} onClick={onEnroll}><ScanFace size={20} aria-hidden /> Daftar wajah</button>}
    <section className={styles.group} aria-labelledby="cara-kerja-wajah">
      <h3 id="cara-kerja-wajah" className={styles.groupLabel}>Cara kerjanya</h3>
      <ol className={styles.howList}>
        <li>Saat absen, kamera depan mengambil selfie{state.method === "gerakan" ? " sambil kamu berkedip atau menoleh" : ""}.</li>
        <li>HP-mu mengubah wajah jadi angka ciri; server mencocokkannya dengan foto acuanmu.</li>
        <li>Cocok dan kamu di dalam titik kantor: absen tercatat Sah.</li>
      </ol>
    </section>
    <Group label="Yang disimpan" note="Hanya kamu dan Admin HR yang bisa melihatnya. Tidak dipakai untuk hal lain selain absensi.">
      <RowInfo title="Foto acuan" value="Sampai kamu hapus" />
      <RowInfo title="Selfie tiap absen" value="90 hari" />
      <RowInfo title="Lokasi saat absen" value="Bersama absennya" />
    </Group>
    {state.face && <Group label="Hakmu" note="Setelah dihapus, absenmu dicatat Admin HR secara manual sampai kamu daftar wajah lagi.">
      <RowButton title="Hapus data wajah" danger chevron={false} onClick={onWithdraw} />
    </Group>}
  </Detail>;
}

/* ── Detail: Bantuan & FAQ ──────────────────────────────────────────── */

/**
 * Bantuan & FAQ (21 Nov 2026, the owner's ask: help and the FAQ as one, out of the way of the
 * settings): the questions people ask, each opening in place; the office points sit in their
 * answer, with a map link each.
 */
export function HelpDetail({ state, onBack }: { state: ClockInState; onBack(): void }) {
  const method = state.method === "gerakan" ? "selfie sambil berkedip atau menoleh sesuai petunjuk" : "satu selfie yang langsung dicocokkan";
  const faq: { q: string; a: ReactNode }[] = [
    { q: "Bagaimana cara absen?", a: <>Di Beranda tekan <strong>Absen masuk</strong> atau <strong>Absen pulang</strong>. WG People membaca lokasimu, lalu membuka kamera depan untuk {method}. Selesai dalam beberapa detik.</> },
    { q: "Di mana saja titik kantor?", a: state.offices.length
      ? <><span>Absen di dalam lingkaran ini tercatat Sah:</span><ul className={styles.helpList}>{state.offices.map(office => <li key={office.id}>
        <a href={`https://www.google.com/maps/search/?api=1&query=${office.lat},${office.lng}`} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden /> {office.name}<SrOnly> (peta, tab baru)</SrOnly></a>
        <span> · radius {office.radiusM} m · {office.zone}</span>
      </li>)}</ul></>
      : "Admin HR belum memasang titik kantor. Sampai ada, semua absen tercatat di luar kantor." },
    { q: "Saya absen di luar kantor (event, dinas, WFH)", a: "Absen tetap bisa. Pilih alasannya saat absen; statusnya Perlu dicek sampai Admin HR memeriksanya." },
    { q: "Lupa absen atau jamnya salah", a: <>Buka <strong>Pengajuan → Ajukan → Revisi absen</strong>, pilih harinya (sampai 31 hari ke belakang), lalu tulis alasannya. Admin HR yang memutuskan.</> },
    { q: "Mengajukan cuti, sakit, izin, atau dinas", a: <>Buka <strong>Pengajuan → Ajukan</strong>, pilih jenis dan tanggalnya. Tim melihat jenis dan tanggalnya di menu <strong>Tim</strong>; keteranganmu hanya untuk Admin HR.</> },
    { q: "Arti Sah, Perlu dicek, dan Ditolak", a: <><strong>Sah</strong>: wajah cocok dan di dalam titik kantor. <strong>Perlu dicek</strong>: ada yang perlu dilihat Admin HR (di luar kantor, kecocokan rendah). <strong>Ditolak</strong>: Admin HR menolaknya; ajukan revisi bila keliru.</> },
    { q: "Kenapa saya diminta daftar wajah?", a: "Akunmu belum punya foto acuan dari HR, atau fotonya belum bisa dipakai. Daftar sekali saja, sekitar satu menit; Admin HR menyetujuinya." },
    { q: "Kamera atau lokasi tidak mau terbuka", a: "Izinkan Kamera dan Lokasi untuk situs ini di pengaturan browser, nyalakan GPS, lalu coba lagi. Di iPhone, pakai Safari." },
    { q: "Masih ada yang membingungkan?", a: "Hubungi Admin HR di kantor. Sebutkan tanggal dan jam absennya supaya cepat dicek." },
  ];
  return <Detail title="Bantuan & FAQ" onBack={onBack}>
    <p className={styles.lead}>Jawaban singkat untuk yang paling sering ditanyakan. Ketuk pertanyaannya.</p>
    <div className={styles.faq}>
      {faq.map(item => <details key={item.q} className={styles.faqItem}>
        <summary>{item.q}</summary>
        <div className={styles.faqAnswer}>{item.a}</div>
      </details>)}
    </div>
  </Detail>;
}
