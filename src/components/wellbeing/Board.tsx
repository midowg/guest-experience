"use client";

import { Fragment, useState } from "react";
import { ChevronRight, Crown, Flag, Gift, Medal, MoreVertical, Plus, Target, Timer, Trophy } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { useResource } from "@/components/app-shell/resource";
import type { WbBoard, WbBoardRow } from "@/lib/wellbeing/app-types";
import { DIMENSIONS, dimensionLabels, monthRange, previousMonth, wibToday } from "@/lib/wellbeing/rules";
import type { BoardDim, BoardPeriod } from "./api";
import { keys, reducedMotion, useWellbeing } from "./context";
import { firstName, formatDate, num } from "./format";
import { dimensionIcons, Icon } from "./icons";
import { Avatar, Chips, cx, Empty, ErrorState, LeaderRow, Preparing, Seg, Sk, SkRows, StaleBar } from "./parts";
import { boardView, chaseOf, daysLeftLabel, medalOf } from "./race";
import css from "./wellbeing.module.css";

/*
 * Peringkat (17 Nov 2026; the race, 18 Nov 2026): this month or all time, all points or one
 * dimension. The page shows a few, the full list waits behind Lihat semua (a sheet):
 *   - the arena: the race's name and days left, the prize, and the top three on a lit podium
 *     (gold, silver, bronze, each with its number, never colour alone; #1 crowned with its lead);
 *   - Posisimu: my place, the one to catch and the gap, and how far the podium is;
 *   - the chasers (#4 to #8), then the one above me, me and the one below when I am further down;
 *   - last month's champion at the end.
 */

const PERIODS = [["month", "Bulan ini"], ["all", "Sepanjang waktu"]] as const;

export function Board({ period, dim, onChange }: { period: BoardPeriod; dim: BoardDim; onChange: (next: { period: BoardPeriod; dim: BoardDim }) => void }) {
  const { api } = useWellbeing();
  const board = useResource(keys.board(period, dim), () => api.leaderboard(period, dim));
  // The prize this month (Admin Wellbeing → Aplikasi karyawan), from Beranda's data.
  const prize = useResource(keys.home, () => api.home()).data?.controls?.prize ?? null;
  const data = board.data;
  const today = wibToday();
  const lastMonth = formatDate(previousMonth(today).from, { month: "long" });

  return <>
    <p className={css.largeTitle} aria-hidden="true">Peringkat</p>
    <Seg label="Periode" value={period} options={PERIODS} onChange={next => onChange({ period: next, dim })} />
    <Chips label="Dimensi" style={{ marginTop: 12 }}>
      <button type="button" className={css.chip} aria-pressed={dim === "all"} onClick={() => onChange({ period, dim: "all" })}>Semua</button>
      {DIMENSIONS.map(dimension => <button key={dimension} type="button" className={css.chip} aria-pressed={dim === dimension} onClick={() => onChange({ period, dim: dimension })}>
        <Icon of={dimensionIcons[dimension]} size={18} />{dimensionLabels[dimension]}
      </button>)}
    </Chips>
    <div style={{ marginTop: 12 }}><StaleBar show={!!board.refreshError} onRetry={() => void board.reload()} /></div>
    {!data
      ? board.error ? <ErrorState message={board.error} onRetry={() => void board.reload()} /> : <BoardSkeleton />
      : !data.migrated ? <div style={{ marginTop: 16 }}><Preparing /></div>
      : <>
          {data.items.length === 0
            ? <>
                {period === "month" && <p className={css.raceInfo}><Timer size={16} aria-hidden="true" /><span>Berakhir <b>{formatDate(monthRange(today).to, { day: "numeric", month: "long" })}</b> · {daysLeftLabel(today).toLowerCase()}</span></p>}
                <div style={{ marginTop: 16 }}><Empty icon={<Trophy size={24} aria-hidden="true" />}>{period === "month" ? "Belum ada yang mendapat poin bulan ini. Jadilah yang pertama." : "Belum ada poin."}</Empty></div>
              </>
            : <>
                <Arena board={data} period={period} dim={dim} today={today} prize={period === "month" ? prize : null} />
                <Standing board={data} period={period} />
                <Chasers board={data} />
              </>}
          {period === "month" && data.lastMonthChampion && <div className={css.champion}>
            <span className={css.championMark}><Crown size={22} aria-hidden="true" /></span>
            <span className={css.rowMain}>
              <span>Juara {lastMonth}{dim === "all" ? "" : ` · ${dimensionLabels[dim]}`}</span>
              <span className={css.rowTitle}>{data.lastMonthChampion.me ? "Kamu" : data.lastMonthChampion.name}</span>
              <span className={css.rowMeta}>{[data.lastMonthChampion.department, `${num(data.lastMonthChampion.points)} poin`].filter(Boolean).join(" · ")}</span>
            </span>
          </div>}
        </>}
  </>;
}

/** The race's name, its days left and prize, and the top three on a lit podium. */
function Arena({ board, period, dim, today, prize }: { board: WbBoard; period: BoardPeriod; dim: BoardDim; today: string; prize: string | null }) {
  const { podium } = boardView(board);
  const [first, second] = board.items;
  const lead = first && second && first.points > second.points ? first.points - second.points : null;
  const title = `${period === "month" ? `Balapan ${formatDate(today, { month: "long" })}` : "Sepanjang waktu"}${dim === "all" ? "" : ` · ${dimensionLabels[dim]}`}`;

  return <section className={css.arena} aria-labelledby="arena-title">
    <div className={css.raceTop}>
      <h2 className={css.raceLabel} id="arena-title"><Flag size={16} aria-hidden="true" />{title}</h2>
      {period === "month" && <span className={css.raceChip}><Timer size={14} aria-hidden="true" />{daysLeftLabel(today)}</span>}
    </div>
    {prize && <p className={css.racePrize}><Gift size={16} aria-hidden="true" /><span>Hadiah: <b>{prize}</b></span></p>}
    {/* In rank order for screen readers; the grid puts #1 in the middle, #2 left, #3 right. Ties share a place and its medal. */}
    <ol className={css.podium} aria-label="Tiga teratas">
      {podium.map((row, slot) => <li key={row.employeeId} className={css.pod} data-medal={medalOf(row.rank) ?? "bronze"} data-slot={slot} data-me={row.me}>
        <span className={css.podAv}>
          {slot === 0 && row.rank === 1 && <Crown size={26} className={css.podCrown} aria-hidden="true" />}
          <Avatar name={row.name} size={slot === 0 ? "xl" : "lg"} />
        </span>
        <span className="sr-only">Peringkat {row.rank}: </span>
        <span className={css.podName}>{row.me ? "Kamu" : row.name}</span>
        {row.department && <span className={css.podDept}>{row.department}</span>}
        <span className={css.podPts}>{num(row.points)}<small> poin</small></span>
        {slot === 0 && lead != null && <span className={css.podLead}>Unggul {num(lead)}<span className="sr-only"> poin dari peringkat 2</span></span>}
        <span className={css.podBase} aria-hidden="true">{row.rank}</span>
      </li>)}
    </ol>
  </section>;
}

/** Posisimu: my place, the one to catch, and how far the podium is (or how to get in). */
function Standing({ board, period }: { board: WbBoard; period: BoardPeriod }) {
  const { openCatat } = useWellbeing();
  const { me } = board;
  const when = period === "month" ? "bulan ini" : "sepanjang waktu";

  if (!me) return <section className={cx(css.card, css.standing)} aria-labelledby="standing-title">
    <div className={css.standTop}>
      <span className={css.standRank} data-empty="true"><Trophy size={24} aria-hidden="true" /></span>
      <span className={css.rowMain}>
        <h2 className={css.standLabel} id="standing-title">Posisimu {when}</h2>
        <b className={css.standEmpty}>Belum masuk peringkat</b>
      </span>
    </div>
    {period === "month"
      ? <>
          <p className={css.standLine}>Satu aktivitas sudah cukup untuk masuk dan mulai mengejar.</p>
          <button type="button" className={cx(css.btn, css.btnPrimary, css.block)} onClick={() => openCatat()}><Plus size={20} aria-hidden="true" />Catat aktivitas</button>
        </>
      : <p className={css.standLine}>Poin dari aktivitas yang kamu catat akan masuk ke sini.</p>}
  </section>;

  const chase = chaseOf(board);
  const { podiumGap } = boardView(board);
  const medal = medalOf(me.rank);
  return <section className={cx(css.card, css.standing)} aria-labelledby="standing-title">
    <div className={css.standTop}>
      <span className={css.standRank} data-medal={medal ?? undefined}><span className="sr-only">Peringkat </span><span aria-hidden="true">#</span>{me.rank}</span>
      <span className={css.rowMain}>
        <h2 className={css.standLabel} id="standing-title">Posisimu {when}</h2>
        <span className={css.standPts}>{num(me.points)}<small> poin</small></span>
        <span className={css.rowMeta}>dari {num(board.of)} karyawan</span>
      </span>
    </div>
    {chase.kind === "chase" && <div className={css.standChase}>
      <div className={css.chaseLine}>
        <span><Target size={16} aria-hidden="true" /><span className={css.chaseWho}>Kejar <b>#{chase.ahead.rank} {firstName(chase.ahead.name)}</b></span></span>
        <span className={css.standGap}>{num(chase.gap)}<small>poin lagi</small></span>
      </div>
      {/* Where I stand between the one behind me and the one ahead. */}
      <div className={css.standBar} aria-hidden="true"><i style={{ width: `${Math.max(4, Math.round(chase.progress * 100))}%` }} /></div>
    </div>}
    {chase.kind === "lead" && <p className={css.standLine}><Crown size={18} data-tone="gold" aria-hidden="true" />
      <span><b>Kamu memimpin</b>{chase.runnerUp ? <>, unggul {num(chase.margin)} poin dari #{chase.runnerUp.rank} {firstName(chase.runnerUp.name)}.</> : "."} Pertahankan.</span></p>}
    {chase.kind === "tied" && <p className={css.standLine}><Crown size={18} data-tone="gold" aria-hidden="true" />
      <span><b>Seri di puncak</b> dengan {firstName(chase.with.name)}. Satu aktivitas lagi menentukan.</span></p>}
    {medal && chase.kind === "chase" && <p className={css.standLine}><Medal size={18} data-tone={medal} aria-hidden="true" /><span><b>Kamu di podium.</b> Jaga posisimu sampai akhir bulan.</span></p>}
    {podiumGap != null && podiumGap > 0 && !(chase.kind === "chase" && chase.ahead.rank <= 3)
      && <p className={css.standLine}><Medal size={18} aria-hidden="true" /><span><b>{num(podiumGap)} poin</b> lagi ke podium</span></p>}
  </section>;
}

/** #4 to #8, then (further down) the one above me, me and the one below, and Lihat semua. */
function Chasers({ board }: { board: WbBoard }) {
  const { openBoard } = useWellbeing();
  const { chasers, mine, hidden } = boardView(board);
  if (!chasers.length && !mine.length) return null;
  const metaOf = (row: WbBoardRow) => row.me && board.ahead ? `${num(board.ahead.points - row.points)} poin lagi ke #${board.ahead.rank}` : row.department;

  return <section className={css.sec} aria-labelledby="chasers-title">
    <div className={css.secHead}>
      <h2 className={css.sub} id="chasers-title">Mengejar podium</h2>
      <span className={cx(css.caption, css.muted)}>{num(board.items.length)} karyawan berpoin</span>
    </div>
    <ol className={cx(css.card, css.list, css.lbList)}>
      {chasers.map(row => <LeaderRow key={row.employeeId} row={row} meta={metaOf(row)} />)}
      {mine.length > 0 && <li className={css.lbGap} aria-hidden="true"><MoreVertical size={16} /></li>}
      {mine.map(row => <LeaderRow key={row.employeeId} row={row} meta={metaOf(row)} />)}
    </ol>
    {hidden > 0 && <button type="button" className={cx(css.btn, css.btnTonal, css.block, css.allBtn)} onClick={openBoard} aria-haspopup="dialog">
      Lihat semua peringkat<ChevronRight size={20} aria-hidden="true" /></button>}
  </section>;
}

/** Lihat semua: everyone with points for the period and dimension on screen; my own row stays at the bottom and jumps to my place. */
export function BoardSheet({ open, period, dim, onClose }: { open: boolean; period: BoardPeriod; dim: BoardDim; onClose: () => void }) {
  const { api } = useWellbeing();
  // Read only while open (the page has usually loaded it already); the last answer stays while the sheet slides away.
  const board = useResource(open ? keys.board(period, dim) : null, () => api.leaderboard(period, dim));
  const [shown, setShown] = useState<WbBoard | null>(null);
  if (board.data && board.data !== shown) setShown(board.data);
  const data = open ? board.data ?? null : shown;
  const label = `${period === "month" ? "Bulan ini" : "Sepanjang waktu"}${dim === "all" ? "" : ` · ${dimensionLabels[dim]}`}`;
  return <Panel open={open} onClose={onClose} title="Semua peringkat" subtitle={data?.items.length ? `${label} · ${num(data.items.length)} karyawan berpoin` : label} variant="sheet" tall
    footer={data?.me ? <MineFoot board={data} /> : undefined}>
    {!data
      ? board.error ? <ErrorState message={board.error} onRetry={() => void board.reload()} /> : <SkRows rows={8} />
      : !data.items.length ? <Empty icon={<Trophy size={24} aria-hidden="true" />}>Belum ada poin.</Empty>
      : <AllRanks board={data} />}
  </Panel>;
}

const MINE_ID = "wb-board-mine";

function AllRanks({ board }: { board: WbBoard }) {
  // An older answer listed only the top 30: then the rows around me follow after a gap.
  const listed = board.items.some(row => row.me);
  const rows = listed || !board.me ? board.items : [...board.items, ...board.near.filter(row => !board.items.some(item => item.employeeId === row.employeeId))];
  return <ol className={cx(css.card, css.list, css.lbList)} aria-label="Peringkat">
    {rows.map((row, index) => <Fragment key={row.employeeId}>
      {index > 0 && row.rank > rows[index - 1].rank + 1 && !listed && <li className={css.lbGap} aria-hidden="true"><MoreVertical size={16} /></li>}
      <LeaderRow row={row} meta={row.department} rowRef={row.me ? element => { if (element) element.id = MINE_ID; } : undefined} />
    </Fragment>)}
  </ol>;
}

/** My row under the full list: always in sight; a tap scrolls the list to my place. */
function MineFoot({ board }: { board: WbBoard }) {
  const me = board.me;
  if (!me) return null;
  const gap = board.ahead ? `${num(board.ahead.points - me.points)} poin lagi ke #${board.ahead.rank}` : me.rank === 1 ? "Di puncak" : "";
  return <button type="button" className={cx(css.lbRow, css.mineFoot, css.pressable)} data-me="true"
    aria-label={`Posisimu: peringkat ${me.rank}, ${num(me.points)} poin${gap ? `, ${gap}` : ""}. Tampilkan di daftar`}
    onClick={() => document.getElementById(MINE_ID)?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })}>
    <span className={css.lbRank} data-medal={medalOf(me.rank) ?? undefined}>{me.rank}</span>
    <Avatar name={me.name} />
    <span className={css.rowMain}><span className={css.rowTitle}>Kamu</span>{gap && <span className={css.rowMeta}>{gap}</span>}</span>
    <b className={css.lbPts}>{num(me.points)}</b>
  </button>;
}

function BoardSkeleton() {
  return <div aria-busy="true" aria-label="Memuat">
    <div className={css.arena}>
      <Sk width={150} height={14} style={{ background: "var(--ink-2)", margin: "7px 6px" }} />
      <div className={css.podium}>{[78, 104, 60].map((height, index) => <div key={index} className={css.pod} data-slot={[1, 0, 2][index]}>
        <Sk width={index === 1 ? 80 : 44} height={index === 1 ? 80 : 44} radius={999} style={{ background: "var(--ink-2)" }} />
        <Sk width="64%" height={10} style={{ background: "var(--ink-2)", marginTop: 10 }} /><Sk width="40%" height={14} style={{ background: "var(--ink-2)", marginTop: 6 }} />
        <Sk height={height} radius={14} style={{ borderRadius: "14px 14px 0 0", background: "var(--ink-2)", marginTop: 10, width: "100%" }} />
      </div>)}</div>
    </div>
    <div className={cx(css.card, css.standing)}><div className={css.standTop}><Sk width={64} height={64} radius={18} /><span className={css.rowMain}><Sk width="40%" height={10} /><Sk width="55%" height={20} style={{ marginTop: 6 }} /></span></div></div>
    <div className={css.sec}><SkRows rows={5} /></div>
  </div>;
}
