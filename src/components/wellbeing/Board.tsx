"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, MoreVertical, Timer, Trophy } from "lucide-react";
import { useResource } from "@/components/app-shell/resource";
import type { WbBoard, WbBoardRow } from "@/lib/wellbeing/app-types";
import { DIMENSIONS, dimensionLabels, monthRange, previousMonth, wibToday } from "@/lib/wellbeing/rules";
import type { BoardDim, BoardPeriod } from "./api";
import { keys, useWellbeing } from "./context";
import { firstName, formatDate, num } from "./format";
import { dimensionIcons, Icon } from "./icons";
import { Avatar, Chips, cx, Empty, ErrorState, LeaderRow, Preparing, Seg, Sk, SkRows, StaleBar } from "./parts";
import { daysLeftLabel, medalOf, nearBeyond } from "./race";
import css from "./wellbeing.module.css";

/*
 * Peringkat (17 Nov 2026; the race, 18 Nov 2026): this month or all time, all points or one
 * dimension. Last month's champion, then the top three on a podium with gold, silver and bronze
 * (each with its number, never colour alone), then the list. Past the top 30, the people around me
 * follow after a gap. My own row sticks to the bottom only while it is out of view, with how far
 * the next place is.
 */

const PERIODS = [["month", "Bulan ini"], ["all", "Sepanjang waktu"]] as const;

export function Board({ active, period, dim, onChange }: { active: boolean; period: BoardPeriod; dim: BoardDim; onChange: (next: { period: BoardPeriod; dim: BoardDim }) => void }) {
  const { api } = useWellbeing();
  const board = useResource(keys.board(period, dim), () => api.leaderboard(period, dim));
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
    {period === "month" && <p className={css.raceInfo}><Timer size={16} aria-hidden="true" /><span>Berakhir <b>{formatDate(monthRange(today).to, { day: "numeric", month: "long" })}</b> · {daysLeftLabel(today).toLowerCase()}</span></p>}
    <div style={{ marginTop: 12 }}><StaleBar show={!!board.refreshError} onRetry={() => void board.reload()} /></div>
    {!data
      ? board.error ? <ErrorState message={board.error} onRetry={() => void board.reload()} /> : <BoardSkeleton />
      : !data.migrated ? <div style={{ marginTop: 16 }}><Preparing /></div>
      : <>
          {period === "month" && data.lastMonthChampion && <div className={css.champion}>
            <span className={css.championMark}><Crown size={22} aria-hidden="true" /></span>
            <span className={css.rowMain}>
              <span>Juara {lastMonth}{dim === "all" ? "" : ` · ${dimensionLabels[dim]}`}</span>
              <span className={css.rowTitle}>{data.lastMonthChampion.me ? "Kamu" : data.lastMonthChampion.name}</span>
              <span className={css.rowMeta}>{[data.lastMonthChampion.department, `${num(data.lastMonthChampion.points)} poin`].filter(Boolean).join(" · ")}</span>
            </span>
          </div>}
          {data.items.length === 0
            ? <div style={{ marginTop: 16 }}><Empty icon={<Trophy size={24} aria-hidden="true" />}>{period === "month" ? "Belum ada yang mendapat poin bulan ini. Jadilah yang pertama." : "Belum ada poin."}</Empty></div>
            : <Ranking board={data} active={active} />}
          {!data.me && data.items.length > 0 && <p className={cx(css.note, css.noteInfo)}>
            <Trophy size={20} aria-hidden="true" /><span>{period === "month" ? "Kamu belum masuk peringkat bulan ini. Satu aktivitas sudah cukup untuk masuk." : "Kamu belum punya poin di peringkat ini."}</span>
          </p>}
        </>}
  </>;
}

function Ranking({ board, active }: { board: WbBoard; active: boolean }) {
  const { items, me, of, ahead } = board;
  const top = items.slice(0, 3), rest = items.slice(3);
  const beyond = nearBeyond(board);
  const mine = useRef<HTMLElement | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [ownVisible, setOwnVisible] = useState(true);
  const listed = items.some(row => row.me) || beyond.some(row => row.me);

  // The sticky "Kamu" row shows only while my own row (on the podium or in the list) is out of view.
  useEffect(() => {
    const element = mine.current;
    if (!element || !active) return;
    const root = holder.current?.closest("[data-scroller]") ?? null;
    const observer = new IntersectionObserver(entries => setOwnVisible(entries.some(entry => entry.isIntersecting)), { root, rootMargin: "0px 0px -80px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, items, beyond.length]);
  const showSticky = !!me && (!listed || !ownVisible);
  const ref = (row: WbBoardRow) => row.me ? (element: HTMLElement | null) => { mine.current = element; } : undefined;
  const gapText = me ? ahead ? `${num(ahead.points - me.points)} poin lagi ke #${ahead.rank}` : me.rank === 1 ? "Di puncak bulan ini" : `dari ${num(of)} karyawan` : "";

  return <div ref={holder}>
    <div className={css.stage}>
      {/* In rank order for screen readers; the grid puts #1 in the middle, #2 left, #3 right. */}
      <div className={css.podium} aria-label="Tiga teratas" role="list">
        {top.map((row, slot) => {
          // Ties share a place, and its medal (two at #1: two golds).
          const medal = medalOf(row.rank) ?? "bronze";
          return <div key={row.employeeId} ref={ref(row)} role="listitem" className={css.pod} data-medal={medal} data-slot={slot} data-me={row.me}
            aria-label={`Peringkat ${row.rank}: ${row.me ? "kamu" : row.name}, ${num(row.points)} poin`}>
            <span className={css.podAv}>
              {row.rank === 1 && <Crown size={22} className={css.podCrown} aria-hidden="true" />}
              <Avatar name={row.name} size="lg" />
            </span>
            <span className={css.podName}>{row.me ? "Kamu" : firstName(row.name)}</span>
            <span className={css.podPts}>{num(row.points)}</span>
            <div className={css.podBase} aria-hidden="true">{row.rank}</div>
          </div>;
        })}
      </div>
    </div>
    {rest.length > 0 && <ol className={cx(css.card, css.list)} style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Peringkat berikutnya">
      {rest.map(row => <LeaderRow key={row.employeeId} row={row} meta={row.me ? gapText : row.department} rowRef={ref(row)} />)}
    </ol>}
    {beyond.length > 0 && <>
      <p className={css.gapNote} aria-hidden="true"><MoreVertical size={16} /></p>
      <ol className={cx(css.card, css.list)} style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Di sekitarmu">
        {beyond.map(row => <LeaderRow key={row.employeeId} row={row} meta={row.me ? gapText : row.department} rowRef={ref(row)} />)}
      </ol>
    </>}
    {me && <div className={cx(css.meSticky, css.lbRow)} data-shown={showSticky} aria-hidden="true">
      <span className={css.lbRank}>{me.rank}</span>
      <Avatar name={me.name} />
      <span className={css.rowMain}><span className={css.rowTitle}>Kamu</span><span className={css.rowMeta}>{gapText}</span></span>
      <b className={css.lbPts}>{num(me.points)}</b>
    </div>}
  </div>;
}

function BoardSkeleton() {
  return <div aria-busy="true" aria-label="Memuat">
    <div className={css.stage}><div className={css.podium}>{[70, 92, 54].map((height, index) => <div key={index} className={css.pod}>
      <Sk width={52} height={52} radius={999} style={{ background: "var(--ink-2)" }} /><Sk width="60%" height={10} style={{ background: "var(--ink-2)" }} /><Sk width="40%" height={10} style={{ background: "var(--ink-2)" }} />
      <Sk height={height} radius={12} style={{ borderRadius: "12px 12px 0 0", background: "var(--ink-2)" }} />
    </div>)}</div></div>
    <SkRows rows={6} />
  </div>;
}
