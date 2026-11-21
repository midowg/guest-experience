"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, FileText, Languages, LifeBuoy, MapPin, Palette, Plus, ScanFace, ShieldCheck } from "lucide-react";
import { nextKind, REQUEST_DAYS, type AttendanceRequest, type ClockInState, type DailyKind, type DailyRecord, type FaceStatus } from "@/lib/hr/attendance";
import type { Copy } from "@/lib/hr/copy";
import { distanceLabel } from "@/lib/hr/geo";
import { clockAt, hhmm, LANGS, langNames, sayDate, type Lang } from "@/lib/hr/lang";
import { THEMES, type Theme } from "@/lib/hr/theme";
import { covers, leaveDays, spanLabel, type LeaveRequest } from "@/lib/hr/leave";
import { matchPercent } from "@/lib/hr/face-match";
import { byWeek, durationLabel, historySummary, minuteOfDay, minutesByDate, shiftDate, weekOf, workedMinutes } from "@/lib/hr/history";
import { zoneDate, zoneTime, zoneSuffix, type ViewerZone } from "@/lib/pra-wam/zone";
import { useCopy } from "./lang";
import { DayLine, Detail, Empty, Group, initials, LargeHead, RowButton, RowInfo, Segmented, SrOnly, StatusWord } from "./ui";
import { WgMark } from "./WgMark";
import styles from "./app.module.css";

/*
 * WG People's screens (21 Nov 2026): the tab roots and the detail screens they open. They only show
 * and ask; what happens (the camera, the server, the history) is in ClockInFlow. Rows that open a
 * detail carry a `mark`, so focus finds them again on the way back. Every word comes from the
 * person's language (copy.ts). Beranda (fourth look, same day, "status sentence", after Homebase,
 * Factorial and Paie): the day said in one large sentence, the day line, one yellow action, then
 * today's two records, what needs attention and the week. Riwayat: the date as a tile, the counts as
 * badges, and a row's status under its text (two columns, not three).
 */

const usable = (status: FaceStatus | undefined) => status === "aktif" || status === "menunggu" || status === "siap";
const recordsOf = (state: ClockInState, date: string) => ({
  masuk: state.recent.find(record => record.workDate === date && record.kind === "masuk") ?? null,
  pulang: state.recent.find(record => record.workDate === date && record.kind === "pulang") ?? null,
});
/** Where a record was made, in words (also the receipt after an absen). */
export const placeOf = (record: DailyRecord, t: Copy) => record.method === "manual" && !record.officeName && !record.reasonKind ? t.day.manual
  : record.reasonKind ? t.reason[record.reasonKind] : record.officeName ?? t.flags.di_luar_area;
/** "Good morning" by the hour where the person is: Beranda says "Good morning, Rina." */
export const greetingAt = (iso: string, zone: ViewerZone, t: Copy) => t.greeting(Number(zoneTime(iso, zone).slice(0, 2)));
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
/** Words with every other part strong: ["In since ", "08:12", "…"]. */
const said = (parts: string[]) => parts.map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part));

function useDates() {
  const { t, lang } = useCopy();
  return {
    t, lang,
    longDay: (date: string) => sayDate(lang, date, t.dateLong),
    shortDay: (date: string) => sayDate(lang, date, t.dateShort),
    clock: (record: DailyRecord | null, zone: ViewerZone) => (record ? clockAt(lang, record.at, zone) : null),
  };
}

/* ── Beranda ─────────────────────────────────────────────────────────── */

export function HomeScreen({ state, now, zone, name, onClock, onDay, onRevise }: {
  state: ClockInState; now: string; zone: ViewerZone; name: string;
  onClock(kind: DailyKind): void; onDay(date: string): void; onRevise(date: string): void;
}) {
  const { t, lang, longDay, shortDay, clock } = useDates();
  const { masuk, pulang } = state.today;
  const next = nextKind(state.today);
  const today = state.today.workDate;
  const nowMinute = minuteOfDay(now, zone);
  const worked = masuk ? workedMinutes(masuk.at, pulang?.at ?? now) : 0;
  const time = durationLabel(worked, lang);
  const sentence = !masuk && !pulang ? t.home.notYet
    : masuk && !pulang ? (worked >= 8 * 60 ? t.home.overtime(clock(masuk, zone)!, time) : t.home.working(clock(masuk, zone)!, time))
      : masuk && pulang ? t.home.finished(time, clock(masuk, zone)!, clock(pulang, zone)!)
        : t.home.onlyOut(clock(pulang, zone)!);
  const span = spanOf(masuk, pulang, zone, pulang ? null : nowMinute);
  // Today's own cuti, sakit, izin or dinas (approved first), said under the sentence; absen stays possible (dinas often clocks in).
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
    <header className={styles.hello}>
      <p className={styles.eyebrow}>{longDay(today)} · <time dateTime={now}>{clockAt(lang, now, zone)}</time> {zone}</p>
      <h1 className={styles.helloTitle}>{greetingAt(now, zone, t)}{name ? `, ${name}` : ""}.</h1>
      {state.ready && <p className={styles.helloLine}>{said(sentence)}</p>}
      {away && <p className={styles.awayChip} data-type={away.type}>{t.home.awayChip(t.leave[away.type], away.status === "disetujui")}</p>}
    </header>

    {!state.ready
      ? <Empty icon={<Clock3 size={32} aria-hidden />} title={t.home.closed}>{state.waiting ? t.server(state.waiting) : t.home.closedLine}</Empty>
      : <>
        <section className={styles.todayAct} aria-label={t.home.card}>
          <DayLine start={span.start} end={span.end} now={pulang ? null : nowMinute} labels />
          {next
            ? <button type="button" className={styles.wide} onClick={() => onClock(next)}><ScanFace size={22} aria-hidden /> {t.clockIn[next]}</button>
            : <p className={styles.done}><CheckCircle2 size={20} aria-hidden /> {t.home.complete}</p>}
          {next && !usable(state.face?.status) && <p className={styles.actHint}>{t.home.firstTime}</p>}
          {next === "masuk" && <button type="button" className={`${styles.quiet} ${styles.quietMuted}`} onClick={() => onClock("pulang")}>{t.home.forgotIn}</button>}
        </section>

        <Group label={t.home.today}>
          {([["masuk", masuk], ["pulang", pulang]] as const).map(([kind, record]) => <RowButton key={kind} mark={kind === "masuk" ? `hari-${today}` : undefined} onClick={() => onDay(today)}
            lead={<span className={styles.slotKind}>{t.kind[kind]}</span>}
            title={record ? <span className={styles.slotClock}>{clock(record, zone)}{zoneSuffix(zone)}</span> : <span className={styles.timesEmpty}>{t.home.empty}</span>}
            sub={record ? <>{placeOf(record, t)}{record.status !== "sah" && <span className={styles.badges}><StatusWord badge tone={record.status}>{t.status[record.status]}</StatusWord></span>}</> : undefined} />)}
        </Group>
      </>}

    {(forgot || refused) && <Group label={t.home.attention} icons>
      {forgot && <RowButton icon={<AlertCircle size={20} className={styles.warnIcon} />} title={t.home.forgotOut(shortDay(forgot))} sub={t.home.forgotOutLine} onClick={() => onRevise(forgot)} />}
      {refused && <RowButton icon={<AlertCircle size={20} className={styles.dangerIcon} />} mark={`hari-${refused.workDate}`} title={t.home.refused(t.clockIn[refused.kind], shortDay(refused.workDate))} sub={refused.reviewNote ?? t.home.refusedLine} onClick={() => onDay(refused.workDate)} />}
    </Group>}

    <section className={styles.group} aria-labelledby="minggu-ini">
      <div className={styles.groupHead}>
        <h2 id="minggu-ini" className={styles.groupLabel}>{t.home.week}</h2>
        {hours.total + running > 0 && <span className={styles.groupValue}>{durationLabel(hours.total + running, lang)}</span>}
      </div>
      <div className={styles.week}>
        {week.map(date => {
          const day = recordsOf(state, date);
          const check = notSah(day.masuk, day.pulang);
          const mark = check ? "cek" : day.masuk && day.pulang ? "lengkap" : day.masuk || day.pulang ? "sebagian" : "kosong";
          const minutes = hours.byDate[date] ?? (date === today ? running : 0);
          const word = date > today ? t.home.weekWord.belum : check ? t.status[check.status].toLowerCase() : t.home.weekWord[mark];
          return <button key={date} type="button" className={styles.day} data-day={mark} disabled={date > today} aria-current={date === today ? "date" : undefined} data-mark={`hari-${date}`} onClick={() => onDay(date)}>
            <span className={styles.dayName} aria-hidden>{sayDate(lang, date, { weekday: "short" })}</span>
            <span className={styles.dayNumber} aria-hidden>{Number(date.slice(8))}</span>
            <span className={styles.dayHours} aria-hidden>{minutes ? t.home.hours(minutes) : " "}</span>
            <SrOnly>{longDay(date)}, {word}{minutes ? `, ${durationLabel(minutes, lang)}` : ""}</SrOnly>
          </button>;
        })}
      </div>
      <p className={styles.groupNote} aria-hidden>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_lengkap}`} /> {t.home.legend.lengkap}</span>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_sebagian}`} /> {t.home.legend.sebagian}</span>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_cek}`} /> {t.home.legend.cek}</span>
      </p>
    </section>
  </div>;
}

/* ── Riwayat ─────────────────────────────────────────────────────────── */

type Filter = "semua" | "cek" | "luar";
export function HistoryScreen({ state, zone, onDay }: { state: ClockInState; zone: ViewerZone; onDay(date: string): void }) {
  const { t, lang, longDay, clock } = useDates();
  const [filter, setFilter] = useState<Filter>("semua");
  const dates = [...new Set(state.recent.map(record => record.workDate))];
  const isCheck = (date: string) => state.recent.some(record => record.workDate === date && record.status !== "sah");
  const isOut = (date: string) => state.recent.some(record => record.workDate === date && record.reasonKind);
  const shown = dates.filter(date => filter === "semua" || (filter === "cek" ? isCheck(date) : isOut(date)));
  const summary = historySummary(state.recent, zone);
  const today = state.today.workDate;

  return <div className={styles.screen}>
    <LargeHead title={t.history.title} lead={t.history.lead(summary.usualIn ? hhmm(lang, summary.usualIn) : null)} />
    {dates.length > 0 && <Segmented<Filter> label={t.history.filter} value={filter} onChange={setFilter} options={[
      { value: "semua", label: t.history.all, count: dates.length, unit: t.history.unit },
      { value: "cek", label: t.history.check, count: dates.filter(isCheck).length, unit: t.history.unit, alert: true },
      { value: "luar", label: t.history.outside, count: dates.filter(isOut).length, unit: t.history.unit },
    ]} />}
    {!dates.length && <Empty icon={<CalendarDays size={32} aria-hidden />} title={t.history.empty}>{t.history.emptyLine}</Empty>}
    {dates.length > 0 && !shown.length && <Empty title={t.history.none}>{t.history.noneLine}</Empty>}
    {byWeek(shown, today, lang).map(week => <Group key={week.label} label={week.label}>
      {week.dates.map(date => {
        const { masuk, pulang } = recordsOf(state, date);
        const check = notSah(masuk, pulang);
        const waiting = waitingOn(state, date).length > 0;
        const noOut = Boolean(masuk && !pulang && date < today);
        const first = masuk ?? pulang;
        const inAt = clock(masuk, zone), outAt = clock(pulang, zone);
        return <RowButton key={date} mark={`hari-${date}`} onClick={() => onDay(date)}
          lead={<span className={styles.date} data-today={date === today || undefined} aria-hidden>
            <span className={styles.dateName}>{sayDate(lang, date, { weekday: "short" })}</span><span className={styles.dateNumber}>{Number(date.slice(8))}</span>
          </span>}
          title={<span className={styles.times}>
            <SrOnly>{t.history.srDay(date === today ? t.common.today : longDay(date))}</SrOnly>{inAt ?? <span className={styles.timesEmpty}>{t.history.notYet}</span>}
            <span aria-hidden> → </span><SrOnly>{t.history.srOut}</SrOnly>{outAt ?? <span className={styles.timesEmpty}>{t.history.notYet}</span>}
          </span>}
          sub={<>
            <DayLine thin {...spanOf(masuk, pulang, zone, null)} />
            {date === today ? t.history.todayPrefix : ""}{first ? placeOf(first, t) : ""}
            {(check || noOut || waiting) && <span className={styles.badges}>
              {check && <StatusWord badge tone={check.status}>{t.status[check.status]}</StatusWord>}
              {noOut && <StatusWord badge tone="kosong">{t.history.noOut}</StatusWord>}
              {waiting && <StatusWord badge tone="menunggu">{t.history.pending}</StatusWord>}
            </span>}
          </>} />;
      })}
    </Group>)}
  </div>;
}

/* ── Pengajuan ───────────────────────────────────────────────────────── */

type Asked = { kind: "revisi"; at: string; request: AttendanceRequest } | { kind: "cuti"; at: string; leave: LeaveRequest };
/** Pengajuan: revisions and cuti/sakit/izin/dinas together, waiting ones first, newest first. */
export function RequestsScreen({ state, onNew, onOpen, onOpenLeave }: { state: ClockInState; onNew(): void; onOpen(id: string): void; onOpenLeave(id: string): void }) {
  const { t, lang, shortDay } = useDates();
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
    <LargeHead title={t.requests.title} action={state.ready ? <button type="button" className={styles.headAction} onClick={onNew}><Plus size={18} aria-hidden /> {t.requests.new}</button> : null} />
    <Segmented<"menunggu" | "selesai"> label={t.requests.partLabel} value={part} onChange={setPart} options={[
      { value: "menunggu", label: t.requests.waiting, count: waiting.length, alert: true },
      { value: "selesai", label: t.requests.finished, count: finished.length },
    ]} />
    {shown.length
      ? <Group>{shown.slice(0, 40).map(item => item.kind === "revisi"
        ? <RowButton key={`r-${item.request.id}`} mark={`pengajuan-${item.request.id}`} onClick={() => onOpen(item.request.id)}
          title={t.requestSummary(item.request)}
          sub={<>{t.requests.correction} · {t.requestType[item.request.type]} · {shortDay(item.request.workDate)}
            <span className={styles.badges}><StatusWord badge tone={item.request.status}>{t.requestStatus[item.request.status]}</StatusWord></span></>} />
        : <RowButton key={`c-${item.leave.id}`} mark={`cuti-${item.leave.id}`} onClick={() => onOpenLeave(item.leave.id)}
          lead={<span className={styles.teamAvatar} data-type={item.leave.type} aria-hidden>{t.leave[item.leave.type].slice(0, 1)}</span>}
          title={`${t.leave[item.leave.type]} · ${spanLabel(item.leave.startDate, item.leave.endDate, lang)}`}
          sub={<>{t.common.days(leaveDays(item.leave.startDate, item.leave.endDate))}
            <span className={styles.badges}><StatusWord badge tone={item.leave.status}>{t.requestStatus[item.leave.status]}</StatusWord></span></>} />)}</Group>
      : part === "menunggu"
        ? <Empty icon={<FileText size={32} aria-hidden />} title={t.requests.emptyWaiting}>{t.requests.emptyWaitingLine}</Empty>
        : <Empty icon={<FileText size={32} aria-hidden />} title={t.requests.emptyFinished}>{t.requests.emptyFinishedLine}</Empty>}
  </div>;
}

/* ── Profil ──────────────────────────────────────────────────────────── */

export function ProfileScreen({ state, fullName, zone, theme, onTheme, onFace, onHelp, onSignOut }: {
  state: ClockInState; fullName: string; zone: ViewerZone; theme: Theme; onTheme(theme: Theme): void; onFace(): void; onHelp(): void; onSignOut(): void;
}) {
  const { t, lang, setLang } = useCopy();
  return <div className={styles.screen}>
    <header className={styles.idCard}>
      <p className={styles.idBrand}><WgMark size={22} head="var(--hr-on-brand)" aria-hidden /> WG People</p>
      <span className={styles.avatar} aria-hidden>{initials(fullName)}</span>
      <div className={styles.headText}>
        <h1 className={styles.personName}>{fullName}</h1>
        <p className={styles.idSub}>{t.profile.account(state.face ? t.faceStatus[state.face.status].toLowerCase() : t.profile.noFace)}</p>
      </div>
    </header>
    {/* Only what is changed or looked at often (21 Nov 2026, the owner's ask); the rest is in Help & FAQ. */}
    <Group label={t.profile.attendance} icons>
      <RowButton mark="wajah" icon={<ShieldCheck size={20} />} title={t.profile.face} value={state.face ? t.faceStatus[state.face.status] : t.face.story.kosong.title} onClick={onFace} />
    </Group>
    <Group label={t.profile.settings} icons>
      <li><div className={`${styles.row} ${styles.info}`}>
        <span className={styles.rowIcon} aria-hidden><Languages size={20} /></span>
        <span className={styles.rowText}><span className={styles.rowTitle}>{t.profile.language}</span></span>
        <span className={styles.rowControl}><Segmented<Lang> label={t.profile.language} value={lang} onChange={setLang} options={LANGS.map(value => ({ value, label: langNames[value] }))} /></span>
      </div></li>
      <li><div className={`${styles.row} ${styles.info}`}>
        <span className={styles.rowIcon} aria-hidden><Palette size={20} /></span>
        <span className={styles.rowText}><span className={styles.rowTitle}>{t.profile.look}</span></span>
        <span className={styles.rowControl}><Segmented<Theme> label={t.profile.look} value={theme} onChange={onTheme} options={THEMES.map(value => ({ value, label: t.theme[value] }))} /></span>
      </div></li>
      <RowInfo icon={<Clock3 size={20} />} title={t.profile.zone} value={zone} sub={t.profile.zoneSub} />
    </Group>
    <Group icons>
      <RowButton mark="bantuan" icon={<LifeBuoy size={20} />} title={t.profile.help} sub={t.profile.helpSub} onClick={onHelp} />
    </Group>
    <Group><RowButton title={t.profile.signOut} danger chevron={false} onClick={onSignOut} /></Group>
  </div>;
}

/* ── Detail: one day ─────────────────────────────────────────────────── */

export function DayDetail({ state, date, zone, onBack, onRevise, onRequest }: {
  state: ClockInState; date: string; zone: ViewerZone; onBack(): void; onRevise(date: string): void; onRequest(id: string): void;
}) {
  const { t, lang, longDay, shortDay, clock } = useDates();
  const day = recordsOf(state, date);
  const requests = state.requests.filter(request => request.workDate === date);
  const span = spanOf(day.masuk, day.pulang, zone, null);
  return <Detail title={shortDay(date)} onBack={onBack}
    action={revisable(state, date) ? <button type="button" className={styles.barText} onClick={() => onRevise(date)}>{t.day.correction}</button> : undefined}>
    <div className={styles.daySummary}>
      <p className={styles.daySummaryTimes}>
        {clock(day.masuk, zone) ?? <span className={styles.timesEmpty}>{t.history.notYet}</span>}<span aria-hidden> → </span><SrOnly> – </SrOnly>{clock(day.pulang, zone) ?? <span className={styles.timesEmpty}>{t.history.notYet}</span>}
      </p>
      <p className={styles.lead}>{day.masuk && day.pulang ? t.day.worked(durationLabel(workedMinutes(day.masuk.at, day.pulang.at), lang)) : longDay(date)}</p>
      <DayLine {...span} labels />
    </div>
    {(["masuk", "pulang"] as const).map(kind => {
      const record = day[kind];
      return <Group key={kind} label={t.clockIn[kind]}>
        {record ? <>
          <RowInfo title={t.day.time} value={`${clock(record, zone)} ${zone}`} />
          <RowInfo title={t.day.place} value={placeOf(record, t)} sub={record.reasonText ?? (record.distanceM != null ? t.day.fromOffice(distanceLabel(record.distanceM, lang)) : undefined)} />
          <RowInfo title={t.day.how} value={record.method === "manual" ? t.day.manual : record.faceMethod ? t.method[record.faceMethod] : t.day.face} />
          {record.faceScore != null && <RowInfo title={t.day.match} value={`${matchPercent(record.faceScore)}%`} />}
          <RowInfo title={t.day.status} sub={record.flags.length ? record.flags.map(flag => t.flags[flag]).join(", ") : undefined} trailing={<StatusWord tone={record.status}>{t.status[record.status]}</StatusWord>} />
          {record.reviewNote && <RowInfo title={t.day.note} sub={record.reviewNote} />}
        </> : <RowInfo title={t.day.none(t.clockNoun[kind])} sub={revisable(state, date) ? t.day.forgot : undefined} />}
      </Group>;
    })}
    {requests.length > 0 && <Group label={t.day.requests}>
      {requests.map(request => <RowButton key={request.id} mark={`pengajuan-${request.id}`} title={t.requestSummary(request)} trailing={<StatusWord tone={request.status}>{t.requestStatus[request.status]}</StatusWord>} onClick={() => onRequest(request.id)} />)}
    </Group>}
  </Detail>;
}

/* ── Detail: one request ─────────────────────────────────────────────── */

function useSentAt() {
  const { lang } = useCopy();
  return (iso: string, zone: ViewerZone) => `${sayDate(lang, zoneDate(iso, zone), { day: "numeric", month: "short" })}, ${clockAt(lang, iso, zone)}${zoneSuffix(zone)}`;
}
export function RequestDetail({ request, zone, onBack, onCancel }: { request: AttendanceRequest; zone: ViewerZone; onBack(): void; onCancel(): void }) {
  const { t, longDay } = useDates();
  const sentAt = useSentAt();
  const by = request.decidedLabel ? `${t.decided.approvedBy(request.decidedLabel)} ` : "";
  const decided = request.status === "disetujui" ? { state: "ok", title: t.decided.approved, sub: `${by}${t.decided.applied}` }
    : request.status === "ditolak" ? { state: "no", title: t.decided.rejected, sub: by.trim() }
      : request.status === "dibatalkan" ? { state: "off", title: t.decided.cancelled, sub: t.decided.youCancelled }
        : { state: "now", title: t.decided.waiting, sub: t.decided.waitingLine };
  return <Detail title={t.day.correction} onBack={onBack}>
    <div className={styles.summary}>
      <h2 className={styles.summaryTitle}>{t.requestSummary(request)}</h2>
      <p className={styles.lead}>{t.requestType[request.type]} · {longDay(request.workDate)}</p>
    </div>
    <ol className={styles.steps} aria-label={t.decided.journey}>
      <li className={styles.stepItem}><span className={styles.stepTitle}>{t.decided.sent}</span><span className={styles.stepSub}>{sentAt(request.createdAt, zone)}</span></li>
      <li className={styles.stepItem} data-state={decided.state}><span className={styles.stepTitle}>{decided.title}</span>{decided.sub && <span className={styles.stepSub}>{decided.sub}</span>}</li>
    </ol>
    <Group label={t.decided.yourReason}><RowInfo title={<span className={styles.plainText}>{request.note}</span>} /></Group>
    {request.decisionNote && <Group label={t.decided.hrNote}><RowInfo title={<span className={styles.plainText}>{request.decisionNote}</span>} /></Group>}
    {request.status === "menunggu" && <Group><RowButton title={t.decided.withdraw} danger chevron={false} onClick={onCancel} /></Group>}
  </Detail>;
}

/* ── Detail: one cuti, sakit, izin or dinas ────────────────────────────── */

export function LeaveDetail({ leave, zone, onBack, onCancel }: { leave: LeaveRequest; zone: ViewerZone; onBack(): void; onCancel(): void }) {
  const { t, lang, longDay } = useDates();
  const sentAt = useSentAt();
  const by = leave.decidedLabel ? `${t.decided.approvedBy(leave.decidedLabel)} ` : "";
  const decided = leave.status === "disetujui" ? { state: "ok", title: t.decided.approved, sub: `${by}${t.decided.onCalendar}` }
    : leave.status === "ditolak" ? { state: "no", title: t.decided.rejected, sub: by.trim() }
      : leave.status === "dibatalkan" ? { state: "off", title: t.decided.cancelled, sub: t.decided.youCancelled }
        : { state: "now", title: t.decided.waiting, sub: t.decided.waitingTeam };
  return <Detail title={t.leave[leave.type]} onBack={onBack}>
    <div className={styles.summary}>
      <h2 className={styles.summaryTitle}>{t.leaveSummary(leave.type, spanLabel(leave.startDate, leave.endDate, lang), leaveDays(leave.startDate, leave.endDate))}</h2>
      <p className={styles.lead}>{leave.startDate === leave.endDate ? longDay(leave.startDate) : `${longDay(leave.startDate)} – ${longDay(leave.endDate)}`}</p>
    </div>
    <ol className={styles.steps} aria-label={t.decided.journey}>
      <li className={styles.stepItem}><span className={styles.stepTitle}>{t.decided.sent}</span><span className={styles.stepSub}>{sentAt(leave.createdAt, zone)}</span></li>
      <li className={styles.stepItem} data-state={decided.state}><span className={styles.stepTitle}>{decided.title}</span>{decided.sub && <span className={styles.stepSub}>{decided.sub}</span>}</li>
    </ol>
    <Group label={t.decided.yourNote} note={t.decided.noteNote}><RowInfo title={<span className={styles.plainText}>{leave.note}</span>} /></Group>
    {leave.decisionNote && <Group label={t.decided.hrNote}><RowInfo title={<span className={styles.plainText}>{leave.decisionNote}</span>} /></Group>}
    {leave.status === "menunggu" && <Group><RowButton title={t.decided.withdraw} danger chevron={false} onClick={onCancel} /></Group>}
    {leave.status === "disetujui" && <p className={styles.groupNote}>{t.decided.approvedLater}</p>}
  </Detail>;
}

/* ── Detail: face data ───────────────────────────────────────────────── */

/**
 * Data wajah (rewritten 21 Nov 2026, the owner found it unclear and roundabout): the status and what
 * it means, the one action that fits, then three short parts: how it works, what is kept and for how
 * long, and the right to remove it.
 */
export function FaceDetail({ state, onBack, onEnroll, onWithdraw }: { state: ClockInState; onBack(): void; onEnroll(): void; onWithdraw(): void }) {
  const { t } = useCopy();
  const status = state.face?.status;
  const story = t.face.story[status ?? "kosong"];
  return <Detail title={t.face.title} onBack={onBack}>
    <div className={styles.faceStatus} data-ok={status === "aktif" || undefined}>
      <span className={styles.faceStatusIcon} aria-hidden>{status === "aktif" ? <ShieldCheck size={26} /> : status === "menunggu" || status === "impor" ? <Clock3 size={26} /> : <ScanFace size={26} />}</span>
      <div className={styles.headText}>
        <h2 className={styles.summaryTitle}>{story.title}</h2>
        <p className={styles.lead}>{story.line}</p>
        {state.face && <p className={styles.faceSource}>{state.face.source === "greatday" ? t.face.fromHr : t.face.own}</p>}
      </div>
    </div>
    {state.ready && !usable(status) && <button type="button" className={styles.wide} onClick={onEnroll}><ScanFace size={20} aria-hidden /> {t.face.register}</button>}
    <section className={styles.group} aria-labelledby="cara-kerja-wajah">
      <h3 id="cara-kerja-wajah" className={styles.groupLabel}>{t.face.how}</h3>
      <ol className={styles.howList}>{t.face.steps(state.method === "gerakan").map(step => <li key={step}>{step}</li>)}</ol>
    </section>
    <Group label={t.face.kept} note={t.face.keptNote}>
      <RowInfo title={t.face.reference} value={t.face.referenceKeep} />
      <RowInfo title={t.face.selfies} value={t.face.selfiesKeep} />
      <RowInfo title={t.face.location} value={t.face.locationKeep} />
    </Group>
    {state.face && <Group label={t.face.rights} note={t.face.rightsNote}>
      <RowButton title={t.face.delete} danger chevron={false} onClick={onWithdraw} />
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
  const { t } = useCopy();
  const h = t.help;
  const faq: { q: string; a: ReactNode }[] = [
    { q: h.how, a: said(h.howA(h.method(state.method === "gerakan"))) },
    { q: h.offices, a: state.offices.length
      ? <><span>{h.officesLead}</span><ul className={styles.helpList}>{state.offices.map(office => <li key={office.id}>
        <a href={`https://www.google.com/maps/search/?api=1&query=${office.lat},${office.lng}`} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden /> {office.name}<SrOnly> {h.map}</SrOnly></a>
        <span> · {h.radius(office.radiusM)} · {office.zone}</span>
      </li>)}</ul></>
      : h.noOffices },
    { q: h.outside, a: h.outsideA },
    { q: h.fix, a: said(h.fixA) },
    { q: h.leave, a: said(h.leaveA) },
    { q: h.statuses, a: said(h.statusesA) },
    { q: h.why, a: h.whyA },
    { q: h.camera, a: h.cameraA },
    { q: h.more, a: h.moreA },
  ];
  return <Detail title={h.title} onBack={onBack}>
    <p className={styles.lead}>{h.lead}</p>
    <div className={styles.faq}>
      {faq.map(item => <details key={item.q} className={styles.faqItem}>
        <summary>{item.q}</summary>
        <div className={styles.faqAnswer}>{item.a}</div>
      </details>)}
    </div>
  </Detail>;
}
