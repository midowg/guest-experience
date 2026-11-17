"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronRight, Crown, Flag, Gift, History, Info, Megaphone, NotebookPen, Plus, Target, Timer, X } from "lucide-react";
import { useResource, type Resource } from "@/components/app-shell/resource";
import type { WbAppControls, WbBoard, WbBoardRow, WbHome } from "@/lib/wellbeing/app-types";
import { addDays, DIMENSIONS, dimensionLabels } from "@/lib/wellbeing/rules";
import { keys, reducedMotion, useWellbeing } from "./context";
import { currentWibHour, firstName, formatDate, greeting, num, weekday } from "./format";
import { dimensionIcons, Icon } from "./icons";
import { StreakFlame } from "./Flame";
import { ActivityRow, cx, Empty, ErrorState, LeaderRow, Sk, SkRows, StaleBar } from "./parts";
import { chaseOf, daysLeftLabel, litToday, rankTrend } from "./race";
import { RewardsCard } from "./Rewards";
import css from "./wellbeing.module.css";

/*
 * Beranda (17 Nov 2026; the race, 18 Nov 2026): the month is a race. First my place this month,
 * the one to catch and how far (or my lead), with the days left; then the people around me, the
 * last 7 days with the streak, this month per dimension, and the latest activities. The all-time
 * total stays on the race card, smaller: the month is what can still be won.
 */
export function Home({ home }: { home: Resource<WbHome> }) {
  const { api, me, go, openCatat, openActivity } = useWellbeing();
  const hour = useMemo(() => currentWibHour(), []);
  // The month's board, shared with Peringkat (fetched once, kept for both).
  const board = useResource(keys.board("month", "all"), () => api.leaderboard("month", "all"));
  const data = home.data;

  if (!data) return home.error ? <ErrorState message={home.error} onRetry={() => void home.reload()} /> : <HomeSkeleton />;
  const nickname = data.me.nickname || me.nickname || data.me.name;
  const maxDim = Math.max(1, ...DIMENSIONS.map(dimension => data.dims[dimension]));

  return <>
    <StaleBar show={!!home.refreshError} onRetry={() => void home.reload()} />
    <div className={css.greet}>
      <p className={cx(css.caption, css.muted)}>{formatDate(data.today, { weekday: "long", day: "numeric", month: "long" })}</p>
      <p className={css.greetTitle}>{greeting(hour)}, {nickname}</p>
    </div>
    {!data.migrated && <div className={cx(css.note, css.noteInfo)} style={{ marginTop: 0, marginBottom: 16 }}><Info size={20} aria-hidden="true" /><span><b>Wellbeing sedang disiapkan.</b> Poin dan peringkat muncul di sini setelah siap.</span></div>}
    {data.controls?.announcement && <Announcement announcement={data.controls.announcement} />}

    <RaceCard data={data} board={board.data?.migrated ? board.data : null} boardLoading={!board.data && !board.error} />
    {/* Hadiah (18 Nov 2026): the saldo and the nearest reward, once the admin has put rewards up. */}
    <RewardsCard />
    <Around board={board.data?.migrated ? board.data : null} />
    <Week data={data} />

    <section className={css.sec} aria-labelledby="dim-title">
      <div className={css.secHead}><h2 className={css.sub} id="dim-title">Dimensi bulan ini</h2></div>
      <div className={cx(css.card, css.list)}>
        {DIMENSIONS.map(dimension => <div key={dimension} className={css.dimRow} data-dim={dimension}>
          <span className={css.lead} data-dim={dimension}><Icon of={dimensionIcons[dimension]} size={18} /></span>
          <span className={css.dimName}>{dimensionLabels[dimension]}</span>
          <b>{num(data.dims[dimension])}</b>
          <span className={css.meter} aria-hidden="true"><i style={{ width: `${Math.round(data.dims[dimension] / maxDim * 100)}%` }} /></span>
        </div>)}
      </div>
    </section>

    <section className={css.sec} aria-labelledby="recent-title">
      <div className={css.secHead}><h2 className={css.sub} id="recent-title">Aktivitas terakhir</h2>{data.recent.length > 0 && <button type="button" className={css.link} onClick={() => go("riwayat")}>Lihat semua<ChevronRight size={16} aria-hidden="true" /></button>}</div>
      {data.recent.length
        ? <div className={cx(css.card, css.list)}>{data.recent.map(activity => <ActivityRow key={activity.id} activity={activity} today={data.today} onOpen={openActivity} />)}</div>
        : <Empty icon={<NotebookPen size={24} aria-hidden="true" />} action={<button type="button" className={cx(css.btn, css.btnPrimary)} onClick={() => openCatat()}><Plus size={20} aria-hidden="true" />Catat aktivitas</button>}>
            Belum ada aktivitas. Tekan <b>Catat</b> untuk mulai.
          </Empty>}
    </section>
    {data.recent.length > 0 && <p className={cx(css.caption, css.faint, css.center, css.footHint)}>
      <History size={14} aria-hidden="true" />Poin langsung masuk saat dicatat; admin memeriksa buktinya setelahnya.
    </p>}
  </>;
}

/** My place this month, the one to catch (or my lead), the days left, and the all-time total. */
function RaceCard({ data, board, boardLoading }: { data: WbHome; board: WbBoard | null; boardLoading: boolean }) {
  const { me, go, openCatat } = useWellbeing();
  const { totals } = data;
  const month = formatDate(data.today, { month: "long" });
  // Kept on this device: my place on the last day I looked. Only a climb is shown (a drop would only discourage). Same day, same answer.
  const trend = useMemo(() => totals.rank == null ? null : rankTrend(`wellbeing-rank:${me.id || data.me.id}`, data.today, totals.rank), [me.id, data.me.id, data.today, totals.rank]);
  const chase = board ? chaseOf(board) : null;

  return <section className={css.race} aria-labelledby="race-title">
    <div className={css.raceTop}>
      <h2 className={css.raceLabel} id="race-title"><Flag size={16} aria-hidden="true" />Balapan {month}</h2>
      <span className={css.raceChip}><Timer size={14} aria-hidden="true" />{daysLeftLabel(data.today)}</span>
    </div>
    <div className={css.raceMain}>
      <div>
        {totals.rank
          ? <p className={css.raceRank}><span className="sr-only">Peringkat </span><span aria-hidden="true">#</span><CountUp value={totals.rank} /></p>
          : <p className={css.raceEmpty}>Belum masuk peringkat</p>}
        <p className={css.raceOf}>
          {totals.rank ? `dari ${num(totals.of)} karyawan` : `Terbuka untuk ${num(totals.of)} karyawan`}
          {trend && trend.delta > 0 ? <span className={css.trend} data-dir="up">
            <ArrowUp size={14} aria-hidden="true" />naik {num(trend.delta)} sejak {trend.since === addDays(data.today, -1) ? "kemarin" : weekday(trend.since)}
          </span> : null}
        </p>
      </div>
      <div className={css.racePts}><b><CountUp value={totals.monthPoints} /></b><span>poin bulan ini</span></div>
    </div>
    {data.controls?.prize && <p className={css.racePrize}><Gift size={16} aria-hidden="true" /><span>Hadiah: <b>{data.controls.prize}</b></span></p>}

    {totals.rank == null
      ? <div className={css.chase}>
          <div className={css.chaseLine}><span>Satu aktivitas sudah cukup untuk masuk peringkat {month}.</span></div>
          <button type="button" className={cx(css.btn, css.block)} onClick={() => openCatat()}><Plus size={20} aria-hidden="true" />Catat aktivitas</button>
        </div>
      : chase?.kind === "chase"
        ? <div className={css.chase}>
            <div className={css.chaseLine}>
              <span><Target size={16} aria-hidden="true" /><span className={css.chaseWho}>Kejar <b>#{chase.ahead.rank} {firstName(chase.ahead.name)}</b></span></span>
              <span className={css.chaseGap}>{num(chase.gap)}<small>poin lagi</small></span>
            </div>
            {/* Where I stand between the one behind me and the one ahead: the gap closing, not points over points. */}
            <div className={css.chaseBar} aria-hidden="true"><i style={{ width: `${Math.max(4, Math.round(chase.progress * 100))}%` }} /></div>
            <div className={css.chaseEnds} aria-hidden="true"><span>{chase.behind ? `#${chase.behind.rank} ${num(chase.behind.points)}` : "0"}</span><span>#{chase.ahead.rank} {num(chase.ahead.points)}</span></div>
          </div>
        : chase?.kind === "lead"
          ? <div className={css.chase}>
              <div className={css.chaseLine}>
                <span><Crown size={16} data-tone="gold" aria-hidden="true" /><span className={css.chaseWho}><b>Kamu memimpin</b>{chase.runnerUp ? `, unggul dari #${chase.runnerUp.rank} ${firstName(chase.runnerUp.name)}` : ""}</span></span>
                {chase.runnerUp && <span className={css.chaseGap}>+{num(chase.margin)}<small>poin</small></span>}
              </div>
            </div>
          : chase?.kind === "tied"
            ? <div className={css.chase}><div className={css.chaseLine}><span><Crown size={16} data-tone="gold" aria-hidden="true" /><span><b>Seri di puncak</b> dengan {firstName(chase.with.name)}. Satu aktivitas lagi menentukan.</span></span></div></div>
            : boardLoading
              ? <div className={css.chase} aria-hidden="true"><Sk width="70%" height={14} style={{ background: "var(--ink-line)" }} /><Sk height={8} radius={999} style={{ marginTop: 12, background: "var(--ink-line)" }} /></div>
              : null}

    <div className={css.raceFoot}>
      <div className={css.raceTotal}><span>Total poin</span><b>{num(totals.points)}</b></div>
      <button type="button" className={css.raceLink} onClick={() => go("peringkat")}>Lihat peringkat<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  </section>;
}

/** The admin's announcement (Admin Wellbeing → Aplikasi karyawan); closed on this device until it changes. */
function Announcement({ announcement }: { announcement: NonNullable<WbAppControls["announcement"]> }) {
  const key = `wellbeing-announcement:${[...`${announcement.title}\n${announcement.message}`].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)}`;
  const [closed, setClosed] = useState(() => { try { return window.localStorage.getItem(key) === "1"; } catch { return false; } });
  if (closed) return null;
  return <section className={css.announce} aria-label="Pengumuman">
    <span className={css.announceIcon} aria-hidden="true"><Megaphone size={20} /></span>
    <div className={css.rowMain}>{announcement.title && <b>{announcement.title}</b>}{announcement.message && <p>{announcement.message}</p>}</div>
    <button type="button" className={css.announceClose} aria-label="Tutup pengumuman" onClick={() => { setClosed(true); try { window.localStorage.setItem(key, "1"); } catch { /* storage unavailable: closed for this visit */ } }}>
      <X size={20} aria-hidden="true" /></button>
  </section>;
}

/** Di sekitarmu: two above and two below me this month (who to catch, who is close behind). */
function Around({ board }: { board: WbBoard | null }) {
  const { go } = useWellbeing();
  if (!board || board.items.length === 0) return null;
  const rows: WbBoardRow[] = board.near.length ? board.near : board.items.slice(0, 3);
  return <section className={css.sec} aria-labelledby="around-title">
    <div className={css.secHead}>
      <h2 className={css.sub} id="around-title">{board.near.length ? "Di sekitarmu" : "Teratas bulan ini"}</h2>
      <button type="button" className={css.link} onClick={() => go("peringkat")}>Peringkat<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <ol className={cx(css.card, css.list)} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map(row => <LeaderRow key={row.employeeId} row={row} meta={row.department} />)}
    </ol>
  </section>;
}

/** The last 7 days (a value on each bar), and the streak: kept going, at risk today, or to start. */
function Week({ data }: { data: WbHome }) {
  const { openCatat } = useWellbeing();
  const { week, streak } = data.totals;
  const total = week.reduce((sum, day) => sum + day.points, 0);
  const maxDay = Math.max(1, ...week.map(day => day.points));
  const lit = litToday(data.totals, data.today);
  const atRisk = streak > 0 && !lit;
  // The flame lights up (once) when today's first activity comes in while Beranda is open.
  const [wasLit, setWasLit] = useState(lit);
  const [ignite, setIgnite] = useState(false);
  if (lit !== wasLit) { setWasLit(lit); setIgnite(lit); }
  return <section className={css.sec} aria-labelledby="week-title">
    <div className={css.secHead}><h2 className={css.sub} id="week-title">7 hari terakhir</h2>{total > 0 ? <b className={css.pts}>+{num(total)} poin</b> : <span className={cx(css.caption, css.muted)}>0 poin</span>}</div>
    <div className={cx(css.card, css.pad)}>
      <div className={css.week} role="img" aria-label={`Poin 7 hari terakhir: ${week.map(day => `${weekday(day.date)} ${num(day.points)}`).join(", ")}`}>
        {week.map((day, index) => <div key={day.date} className={css.weekCol} data-today={day.date === data.today}>
          <span className={css.weekVal} data-zero={day.points <= 0} aria-hidden="true">{compact(day.points)}</span>
          <div className={css.weekBar} data-zero={day.points <= 0} style={{ height: day.points > 0 ? Math.max(6, Math.round(day.points / maxDay * 84)) : 6, animationDelay: `${index * 30}ms` }} />
          <span aria-hidden="true">{weekday(day.date)}</span>
        </div>)}
      </div>
      {/* Duolingo-style: the flame burns once today is logged; an outline only (off) until then. */}
      <div className={css.streak} data-lit={lit}>
        <StreakFlame lit={lit} ignite={ignite} />
        <span className={css.rowMain}>
          {streak > 0
            ? <span className={css.streakCount}><b>{num(streak)}</b> hari beruntun</span>
            : <span className={css.streakCount}>Belum ada streak</span>}
          <span className={css.rowMetaWrap}>{lit ? "Hari ini sudah tercatat. Lanjutkan besok." : atRisk ? "Belum tercatat hari ini." : "Catat hari ini untuk menyalakan api."}</span>
        </span>
        {!lit && <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={() => openCatat()}>Catat sekarang</button>}
      </div>
    </div>
  </section>;
}

/** Over a bar: as it is up to 9.999, then "12rb" (five digits do not fit a seventh of a phone). */
const compact = (value: number) => value >= 10_000 ? `${Math.round(value / 1000)}rb` : num(value);

/** A number counting up from the old one when it changes (not on first show, not with reduced motion). */
function CountUp({ value }: { value: number }) {
  const previous = useRef<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === null || from === value || reducedMotion()) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - started) / 650), eased = 1 - Math.pow(1 - progress, 3);
      setShown(progress < 1 ? Math.round(from + (value - from) * eased) : null);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => { cancelAnimationFrame(frame); setShown(null); };
  }, [value]);
  return <>{num(shown ?? value)}</>;
}

function HomeSkeleton() {
  return <div aria-busy="true" aria-label="Memuat">
    <div className={css.greet}><Sk width="40%" /><Sk width="64%" height={26} radius={8} style={{ marginTop: 10 }} /></div>
    <Sk height={300} radius={24} style={{ background: "var(--ink)", ["--shimmer" as string]: "rgba(255, 255, 255, .06)" }} />
    <div className={css.sec}><Sk width="42%" height={18} style={{ marginBottom: 12 }} /><SkRows rows={5} /></div>
  </div>;
}
