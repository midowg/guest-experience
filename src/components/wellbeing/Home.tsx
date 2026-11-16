"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Flame, History, Info, NotebookPen, Plus, TrendingUp } from "lucide-react";
import type { Resource } from "@/components/app-shell/resource";
import type { WbHome } from "@/lib/wellbeing/app-types";
import { DIMENSIONS, dimensionLabels } from "@/lib/wellbeing/rules";
import { reducedMotion, useWellbeing } from "./context";
import { currentWibHour, formatDate, greeting, num, weekday } from "./format";
import { dimensionIcons, Icon } from "./icons";
import { ActivityRow, cx, Empty, ErrorState, Sk, SkRows, StaleBar } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Beranda (17 Nov 2026): the greeting with today's date (WIB), the total points with this month's
 * place, the streak and the last 7 days, this month per dimension, and the latest activities.
 */
export function Home({ home }: { home: Resource<WbHome> }) {
  const { me, go, openCatat, openActivity } = useWellbeing();
  const hour = useMemo(() => currentWibHour(), []);
  const data = home.data;

  if (!data) return home.error ? <ErrorState message={home.error} onRetry={() => void home.reload()} /> : <HomeSkeleton />;
  const { totals } = data;
  const weekTotal = totals.week.reduce((sum, day) => sum + day.points, 0);
  const maxDay = Math.max(1, ...totals.week.map(day => day.points));
  const maxDim = Math.max(1, ...DIMENSIONS.map(dimension => data.dims[dimension]));
  const nickname = data.me.nickname || me.nickname || data.me.name;

  return <>
    <StaleBar show={!!home.refreshError} onRetry={() => void home.reload()} />
    <div className={css.greet}>
      <p className={cx(css.caption, css.muted)}>{formatDate(data.today, { weekday: "long", day: "numeric", month: "long" })}</p>
      <p className={css.title}>{greeting(hour)}, {nickname}</p>
    </div>
    {!data.migrated && <div className={cx(css.note, css.noteInfo)} style={{ marginTop: 0, marginBottom: 16 }}><Info size={20} aria-hidden="true" /><span><b>Wellbeing sedang disiapkan.</b> Poin dan peringkat muncul di sini setelah siap.</span></div>}

    <section className={css.hero} aria-label="Ringkasan poin">
      <div className={css.heroRow}>
        <div><p className={css.label}>Total poin</p><CountUp value={totals.points} /></div>
        <button type="button" className={cx(css.rank, css.pressable)} onClick={() => go("peringkat")}
          aria-label={totals.rank ? `Peringkat bulan ini ${totals.rank} dari ${totals.of}. Buka Peringkat` : "Belum ada peringkat bulan ini. Buka Peringkat"}>
          <b>{totals.rank ? `#${num(totals.rank)}` : "–"}</b><span>{totals.rank ? `dari ${num(totals.of)}` : "bulan ini"}</span>
        </button>
      </div>
      <div className={css.heroStats}>
        <div className={css.stat}><span><CalendarDays size={16} className={css.icMonth} aria-hidden="true" />Bulan ini</span><b>{num(totals.monthPoints)}</b></div>
        <div className={css.stat}><span><Flame size={16} className={css.icFire} aria-hidden="true" />Streak</span><b>{num(totals.streak)} hari</b></div>
        <div className={css.stat}><span><TrendingUp size={16} className={css.icUp} aria-hidden="true" />7 hari</span><b>+{num(weekTotal)}</b></div>
      </div>
      <div className={css.spark} role="img" aria-label={`Poin 7 hari terakhir: ${totals.week.map(day => `${weekday(day.date)} ${num(day.points)}`).join(", ")}`}>
        {totals.week.map(day => <div key={day.date} className={css.sparkCol} data-today={day.date === data.today}>
          <div className={css.sparkBar} style={{ height: Math.max(4, Math.round(day.points / maxDay * 60)) }} />
          <span>{weekday(day.date)}</span>
        </div>)}
      </div>
    </section>

    <section className={css.sec}>
      <div className={css.secHead}><h2 className={css.sub}>Dimensi bulan ini</h2></div>
      <div className={cx(css.card, css.list)}>
        {DIMENSIONS.map(dimension => <div key={dimension} className={css.row} data-dim={dimension}>
          <span className={css.lead} data-dim={dimension}><Icon of={dimensionIcons[dimension]} size={22} /></span>
          <span className={css.rowMain}>
            <span className={css.dimLine}><span className={css.rowTitle}>{dimensionLabels[dimension]}</span><b>{num(data.dims[dimension])}</b></span>
            <span className={css.meter} aria-hidden="true"><i style={{ width: `${Math.round(data.dims[dimension] / maxDim * 100)}%` }} /></span>
          </span>
        </div>)}
      </div>
    </section>

    <section className={css.sec}>
      <div className={css.secHead}><h2 className={css.sub}>Aktivitas terakhir</h2>{data.recent.length > 0 && <button type="button" className={css.link} onClick={() => go("riwayat")}>Lihat semua</button>}</div>
      {data.recent.length
        ? <div className={cx(css.card, css.list)}>{data.recent.map(activity => <ActivityRow key={activity.id} activity={activity} today={data.today} onOpen={openActivity} />)}</div>
        : <Empty icon={<NotebookPen size={24} aria-hidden="true" />} action={<button type="button" className={cx(css.btn, css.btnPrimary)} onClick={() => openCatat()}><Plus size={20} aria-hidden="true" />Catat aktivitas</button>}>
            Belum ada aktivitas. Tekan <b>Catat</b> untuk mulai.
          </Empty>}
    </section>
    {data.recent.length > 0 && <p className={cx(css.caption, css.faint, css.center)} style={{ marginTop: 20, display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
      <History size={14} aria-hidden="true" />Poin langsung masuk saat dicatat; admin memeriksa buktinya setelahnya.
    </p>}
  </>;
}

/** The total, counting up from the old number when it changes (not on first show, not with reduced motion). */
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
  return <p className={css.display}>{num(shown ?? value)}</p>;
}

function HomeSkeleton() {
  return <div aria-busy="true" aria-label="Memuat">
    <div className={css.greet}><Sk width="40%" /><Sk width="64%" height={30} radius={8} style={{ marginTop: 10 }} /></div>
    <Sk height={268} radius={24} />
    <div className={css.sec}><Sk width="42%" height={18} style={{ marginBottom: 12 }} /><SkRows rows={5} /></div>
  </div>;
}
