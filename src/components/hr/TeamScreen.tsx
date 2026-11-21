"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, UsersRound } from "lucide-react";
import { covers, datesOf, leaveLabels, leaveStatusLabels, monthLabel, monthSpan, spanLabel, LEAVE_TYPES, type TeamLeave } from "@/lib/hr/leave";
import { useStoredValue } from "@/components/console/storage";
import { errorText } from "@/components/pra-wam/api";
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
const say = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const WEEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
/** Monday = 0 … Sunday = 6. */
const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

function Person({ leave, today }: { leave: TeamLeave; today: string }) {
  const days = datesOf(leave.startDate, leave.endDate).length;
  return <RowInfo
    lead={<span className={styles.teamAvatar} data-type={leave.type} aria-hidden>{initials(leave.name)}</span>}
    title={<>{leave.name}{leave.mine && <span className={styles.teamMine}> (kamu)</span>}</>}
    sub={<>{leaveLabels[leave.type]} · {spanLabel(leave.startDate, leave.endDate)}{days > 1 ? ` (${days} hari)` : ""}{covers(leave, today) ? " · hari ini" : ""}</>}
    trailing={<StatusWord tone={leave.status}>{leaveStatusLabels[leave.status]}</StatusWord>} />;
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
  const shown = months[month];

  useEffect(() => {
    if (preview || months[month]) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      loadTeam(month)
        .then(data => { kept.set(month, data); if (alive) setMonths(value => ({ ...value, [month]: data })); })
        .catch(error => { if (alive) setMonths(value => ({ ...value, [month]: { error: errorText(error) } })); });
    }, 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [month, months, preview]);

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
    <LargeHead title="Tim" lead="Siapa yang cuti, sakit, izin, atau dinas." />
    <div className={styles.monthBar}>
      <button type="button" className={styles.monthStep} aria-label={`Bulan sebelumnya, ${monthLabel(span.before)}`} onClick={() => go(span.before)}><ChevronLeft size={22} aria-hidden /></button>
      <h2 className={styles.monthName} aria-live="polite">{monthLabel(month)}</h2>
      <button type="button" className={styles.monthStep} aria-label={`Bulan berikutnya, ${monthLabel(span.after)}`} onClick={() => go(span.after)}><ChevronRight size={22} aria-hidden /></button>
    </div>
    <Segmented<View> label="Tampilan" value={view} onChange={setView} options={[{ value: "kalender", label: "Kalender" }, { value: "daftar", label: "Daftar" }]} />

    {!shown ? <div className={styles.teamLoading} aria-busy="true" aria-label="Memuat" />
      : "error" in shown ? <Empty icon={<UsersRound size={32} aria-hidden />} title="Belum bisa dimuat">{shown.error}</Empty>
        : !shown.ready ? <Empty icon={<CalendarCheck2 size={32} aria-hidden />} title="Cuti dan izin belum dibuka">Admin HR sedang menyiapkannya.</Empty>
          : view === "kalender" ? <>
            <section className={styles.calendar} aria-label={`Kalender ${monthLabel(month)}`}>
              <div className={styles.calendarHead} aria-hidden>{WEEK.map(name => <span key={name}>{name}</span>)}</div>
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
                    <SrOnly>{say(date, { weekday: "long", day: "numeric", month: "long" })}: {away.length ? `${away.length} orang, ${[...new Set(away.map(leave => leaveLabels[leave.type]))].join(", ")}` : "tidak ada yang cuti, sakit, izin, atau dinas"}</SrOnly>
                  </button>;
                })}
              </div>
              <p className={styles.groupNote}>
                {LEAVE_TYPES.map(type => <span key={type} className={styles.legend}><span className={styles.teamDot} data-type={type} aria-hidden /> {leaveLabels[type]}</span>)}
                <span className={styles.legend}><span className={styles.teamDot} data-waiting aria-hidden /> cincin = menunggu</span>
              </p>
            </section>
            {on(day).length
              ? <Group label={say(day, { weekday: "long", day: "numeric", month: "long" })}>{on(day).map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>
              : <Empty title={say(day, { weekday: "long", day: "numeric", month: "long" })}>Tidak ada yang cuti, sakit, izin, atau dinas.</Empty>}
          </>
            : leaves.length === 0 ? <Empty icon={<UsersRound size={32} aria-hidden />} title="Semua di kantor">Tidak ada cuti, sakit, izin, atau dinas di {monthLabel(month)}.</Empty>
              : <>
                {now.length > 0 && <Group label="Hari ini">{now.map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>}
                {coming.length > 0 && <Group label="Akan datang">{coming.map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>}
                {past.length > 0 && <Group label="Sudah lewat">{[...past].reverse().map(leave => <Person key={leave.id} leave={leave} today={today} />)}</Group>}
              </>}
  </div>;
}
