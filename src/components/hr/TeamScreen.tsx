"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, UsersRound } from "lucide-react";
import { covers, datesOf, monthLabel, monthSpan, spanLabel, LEAVE_TYPES, type TeamLeave } from "@/lib/hr/leave";
import { sayDate } from "@/lib/hr/lang";
import { useStoredValue } from "@/components/console/storage";
import { problemText, useCopy } from "./lang";
import { loadTeam } from "./clockInApi";
import { Empty, Group, initials, LargeHead, RowInfo, Segmented, SrOnly, StatusWord } from "./ui";
import styles from "./app.module.css";

/*
 * WG People → Tim (21 Nov 2026, the owner's ask): who is on cuti, sakit, izin or dinas, and whether
 * Admin HR has approved it yet. A month at a time (‹ ›), as a calendar (tap a day to see who) or as
 * a list (now, coming, past). Each kind has its own colour and always its word; approved is a full
 * dot, waiting a ring. Notes are never shown here (only the person and Admin HR read them).
 * Loaded when the place is opened, a month at a time, and kept while the app is open (here, outside
 * the screen, which is drawn afresh each time Tim is opened); the person's own new or withdrawn
 * request (`stamp`) reads the team again.
 */

type Month = { ready: boolean; leaves: TeamLeave[] } | { error: string };
const kept = new Map<string, Month>();
let keptStamp: string | null = null;
type View = "kalender" | "daftar";
/** Monday = 0 … Sunday = 6. */
const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

function Person({ leave, today }: { leave: TeamLeave; today: string }) {
  const { t, lang } = useCopy();
  const days = datesOf(leave.startDate, leave.endDate).length;
  return <RowInfo
    lead={<span className={styles.teamAvatar} data-type={leave.type} aria-hidden>{initials(leave.name)}</span>}
    title={<>{leave.name}{leave.mine && <span className={styles.teamMine}> ({t.common.you})</span>}</>}
    sub={<>{t.leave[leave.type]} · {spanLabel(leave.startDate, leave.endDate, lang)}{days > 1 ? ` (${t.common.days(days)})` : ""}{covers(leave, today) ? t.team.todayMark : ""}
      <span className={styles.badges}><StatusWord badge tone={leave.status}>{t.requestStatus[leave.status]}</StatusWord></span></>} />;
}

export function TeamScreen({ today, stamp = "", preview = null }: { today: string; stamp?: string; preview?: TeamLeave[] | null }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [months, setMonths] = useState<Record<string, Month>>(() => {
    if (preview) return { [today.slice(0, 7)]: { ready: true, leaves: preview } };
    if (keptStamp !== stamp) { kept.clear(); keptStamp = stamp; }
    return Object.fromEntries(kept);
  });
  const [view, setView] = useStoredValue<View>("wg-tim-tampilan", "kalender", ["kalender", "daftar"]);
  const [picked, setPicked] = useState<string | null>(null);
  const { t, lang } = useCopy();
  const say = (date: string, options: Intl.DateTimeFormatOptions) => sayDate(lang, date, options);
  const shown = months[month];

  useEffect(() => {
    if (preview || months[month]) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      loadTeam(month)
        .then(data => { kept.set(month, data); if (alive) setMonths(value => ({ ...value, [month]: data })); })
        .catch(error => { if (alive) setMonths(value => ({ ...value, [month]: { error: problemText(t, error) } })); });
    }, 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [month, months, preview, t]);

  const span = monthSpan(month);
  const go = (to: string) => { setMonth(to); setPicked(null); };
  const leaves = shown && "leaves" in shown ? shown.leaves : [];
  const dates = datesOf(span.first, span.last);
  const day = picked ?? (today.startsWith(month) ? today : dates.find(date => leaves.some(leave => covers(leave, date))) ?? span.first);
  const on = (date: string) => leaves.filter(leave => covers(leave, date));
  const now = leaves.filter(leave => covers(leave, today));
  const coming = leaves.filter(leave => leave.startDate > today);
  const past = leaves.filter(leave => leave.endDate < today);

  return <div className={styles.screen}>
    <LargeHead title={t.team.title} lead={t.team.lead} />
    <div className={styles.monthBar}>
      <button type="button" className={styles.monthStep} aria-label={t.team.before(monthLabel(span.before, lang))} onClick={() => go(span.before)}><ChevronLeft size={22} aria-hidden /></button>
      <h2 className={styles.monthName} aria-live="polite">{monthLabel(month, lang)}</h2>
      <button type="button" className={styles.monthStep} aria-label={t.team.after(monthLabel(span.after, lang))} onClick={() => go(span.after)}><ChevronRight size={22} aria-hidden /></button>
    </div>
    <Segmented<View> label={t.team.view} value={view} onChange={setView} options={[{ value: "kalender", label: t.team.calendar }, { value: "daftar", label: t.team.list }]} />

    {!shown ? <div className={styles.teamLoading} aria-busy="true" aria-label={t.common.loading} />
      : "error" in shown ? <Empty icon={<UsersRound size={32} aria-hidden />} title={t.team.failed}>{shown.error}</Empty>
        : !shown.ready ? <Empty icon={<CalendarCheck2 size={32} aria-hidden />} title={t.team.closed}>{t.team.closedLine}</Empty>
          : view === "kalender" ? <>
            <section className={styles.calendar} aria-label={t.team.calendarOf(monthLabel(month, lang))}>
              <div className={styles.calendarHead} aria-hidden>{t.team.week.map(name => <span key={name}>{name}</span>)}</div>
              <div className={styles.calendarGrid}>
                {Array.from({ length: weekday(span.first) }, (_, index) => <span key={`kosong-${index}`} />)}
                {dates.map(date => {
                  const away = on(date);
                  return <button key={date} type="button" className={styles.calendarDay} aria-pressed={date === day} aria-current={date === today ? "date" : undefined} onClick={() => setPicked(date)}>
                    <span className={styles.calendarNumber} aria-hidden>{Number(date.slice(8))}</span>
                    <span className={styles.calendarDots} aria-hidden>
                      {away.slice(0, 3).map(leave => <span key={leave.id} className={styles.teamDot} data-type={leave.type} data-waiting={leave.status === "menunggu" || undefined} />)}
                      {away.length > 3 && <span className={styles.calendarMore}>+{away.length - 3}</span>}
                    </span>
                    <SrOnly>{t.team.srDay(say(date, t.dateLong), away.length, [...new Set(away.map(leave => t.leave[leave.type]))].join(", "))}</SrOnly>
                  </button>;
                })}
              </div>
              <p className={styles.groupNote}>
                {LEAVE_TYPES.map(type => <span key={type} className={styles.legend}><span className={styles.teamDot} data-type={type} aria-hidden /> {t.leave[type]}</span>)}
                <span className={styles.legend}><span className={styles.teamDot} data-waiting aria-hidden /> {t.team.ring}</span>
              </p>
            </section>
            {on(day).length
              ? <Group label={say(day, t.dateLong)}>{on(day).map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>
              : <Empty title={say(day, t.dateLong)}>{t.team.nobody}</Empty>}
          </>
            : leaves.length === 0 ? <Empty icon={<UsersRound size={32} aria-hidden />} title={t.team.allIn}>{t.team.allInLine(monthLabel(month, lang))}</Empty>
              : <>
                {now.length > 0 && <Group label={t.team.now}>{now.map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>}
                {coming.length > 0 && <Group label={t.team.coming}>{coming.map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>}
                {past.length > 0 && <Group label={t.team.past}>{[...past].reverse().map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>}
              </>}
  </div>;
}
