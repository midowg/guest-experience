"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Trophy } from "lucide-react";
import { useResource } from "@/components/app-shell/resource";
import type { WbBoardRow } from "@/lib/wellbeing/app-types";
import { DIMENSIONS, dimensionLabels, previousMonth, wibToday } from "@/lib/wellbeing/rules";
import type { BoardDim, BoardPeriod } from "./api";
import { keys, useWellbeing } from "./context";
import { firstName, formatDate, num } from "./format";
import { dimensionIcons, Icon } from "./icons";
import { Avatar, cx, Empty, ErrorState, Preparing, Seg, Sk, SkRows, StaleBar } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Peringkat (17 Nov 2026): this month or all time, all points or one dimension. The top three on
 * a podium, then the list; my own row sticks to the bottom only while it is out of view.
 */

const PERIODS = [["month", "Bulan ini"], ["all", "Sepanjang waktu"]] as const;

export function Board({ active, period, dim, onChange }: { active: boolean; period: BoardPeriod; dim: BoardDim; onChange: (next: { period: BoardPeriod; dim: BoardDim }) => void }) {
  const { api } = useWellbeing();
  const board = useResource(keys.board(period, dim), () => api.leaderboard(period, dim));
  const data = board.data;
  const lastMonth = formatDate(previousMonth(wibToday()).from, { month: "long" });

  return <>
    <p className={css.largeTitle} aria-hidden="true">Peringkat</p>
    <Seg label="Periode" value={period} options={PERIODS} onChange={next => onChange({ period: next, dim })} />
    <div className={css.chips} role="group" aria-label="Dimensi" style={{ marginTop: 12 }}>
      <button type="button" className={css.chip} aria-pressed={dim === "all"} onClick={() => onChange({ period, dim: "all" })}>Semua</button>
      {DIMENSIONS.map(dimension => <button key={dimension} type="button" className={css.chip} aria-pressed={dim === dimension} onClick={() => onChange({ period, dim: dimension })}>
        <Icon of={dimensionIcons[dimension]} size={18} />{dimensionLabels[dimension]}
      </button>)}
    </div>
    <div style={{ marginTop: 12 }}><StaleBar show={!!board.refreshError} onRetry={() => void board.reload()} /></div>
    {!data
      ? board.error ? <ErrorState message={board.error} onRetry={() => void board.reload()} /> : <BoardSkeleton />
      : !data.migrated ? <div style={{ marginTop: 16 }}><Preparing /></div>
      : <>
          {period === "month" && data.lastMonthChampion && <p className={css.champion}>
            <Crown size={20} aria-hidden="true" />
            <span>Juara {lastMonth}{dim === "all" ? "" : ` (${dimensionLabels[dim]})`}: <b>{data.lastMonthChampion.me ? "Kamu" : data.lastMonthChampion.name}</b>{[data.lastMonthChampion.department, `${num(data.lastMonthChampion.points)} poin`].filter(Boolean).map(part => ` · ${part}`).join("")}</span>
          </p>}
          {data.items.length === 0
            ? <div style={{ marginTop: 16 }}><Empty icon={<Trophy size={24} aria-hidden="true" />}>{period === "month" ? "Belum ada yang mendapat poin bulan ini." : "Belum ada poin."}</Empty></div>
            : <Ranking items={data.items} me={data.me} of={data.of} active={active} />}
          {!data.me && data.items.length > 0 && <p className={cx(css.note, css.noteInfo)}>
            <Trophy size={20} aria-hidden="true" /><span>{period === "month" ? "Kamu belum masuk peringkat bulan ini. Catat aktivitas untuk mulai." : "Kamu belum punya poin di peringkat ini."}</span>
          </p>}
        </>}
  </>;
}

function Ranking({ items, me, of, active }: { items: WbBoardRow[]; me: WbBoardRow | null; of: number; active: boolean }) {
  const top = items.slice(0, 3), rest = items.slice(3);
  const podium = [top[1], top[0], top[2]].filter(Boolean);
  const mine = useRef<HTMLElement | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [ownVisible, setOwnVisible] = useState(true);
  const listed = items.some(row => row.me);

  // The sticky "Kamu" row shows only while my own row (on the podium or in the list) is out of view.
  useEffect(() => {
    const element = mine.current;
    if (!element || !active) return;
    const root = holder.current?.closest("[data-scroller]") ?? null;
    const observer = new IntersectionObserver(entries => setOwnVisible(entries.some(entry => entry.isIntersecting)), { root, rootMargin: "0px 0px -80px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, items]);
  const showSticky = !!me && (!listed || !ownVisible);
  const ref = (row: WbBoardRow) => row.me ? (element: HTMLElement | null) => { mine.current = element; } : undefined;

  return <div ref={holder}>
    <div className={css.podium} aria-label="Tiga teratas" role="list">
      {podium.map(row => <div key={row.employeeId} ref={ref(row)} role="listitem" className={css.pod} data-place={Math.min(3, row.rank)} data-me={row.me}
        aria-label={`Peringkat ${row.rank}: ${row.me ? "kamu" : row.name}, ${num(row.points)} poin`}>
        <Avatar name={row.name} size="lg" />
        <span className={css.podName}>{row.me ? "Kamu" : firstName(row.name)}</span>
        <span className={css.podPts}>{num(row.points)}</span>
        <div className={css.podBase} aria-hidden="true">{row.rank}</div>
      </div>)}
    </div>
    {rest.length > 0 && <ol className={cx(css.card, css.list)} style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Peringkat berikutnya">
      {rest.map(row => <li key={row.employeeId} ref={ref(row)} className={css.lbRow} data-me={row.me} aria-current={row.me ? "true" : undefined}>
        <span className={css.lbRank}>{row.rank}</span>
        <Avatar name={row.name} />
        <span className={css.rowMain}><span className={css.rowTitle}>{row.me ? `${row.name} (kamu)` : row.name}</span><span className={css.rowMeta}>{row.department}</span></span>
        <b className={css.tnum}>{num(row.points)}</b>
      </li>)}
    </ol>}
    {me && <div className={cx(css.meSticky, css.lbRow)} data-shown={showSticky} aria-hidden="true">
      <span className={css.lbRank}>{me.rank}</span>
      <Avatar name={me.name} />
      <span className={css.rowMain}><span className={css.rowTitle}>Kamu</span><span className={css.rowMeta}>dari {num(of)} orang</span></span>
      <b className={css.tnum}>{num(me.points)}</b>
    </div>}
  </div>;
}

function BoardSkeleton() {
  return <div aria-busy="true" aria-label="Memuat">
    <div className={css.podium}>{[72, 96, 56].map((height, index) => <div key={index} className={css.pod}>
      <Sk width={44} height={44} radius={999} /><Sk width="60%" height={10} /><Sk width="40%" height={10} />
      <Sk height={height} radius={12} style={{ borderRadius: "12px 12px 4px 4px" }} />
    </div>)}</div>
    <SkRows rows={6} />
  </div>;
}
