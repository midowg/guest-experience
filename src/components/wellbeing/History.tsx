"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { History as HistoryIcon, RefreshCw } from "lucide-react";
import { useResource } from "@/components/app-shell/resource";
import type { WbMyActivity, WbMyActivityFilter } from "@/lib/wellbeing/app-types";
import { addDays, wibToday } from "@/lib/wellbeing/rules";
import { errorText, WellbeingApiError } from "./api";
import { keys, useWellbeing } from "./context";
import { dayLabel, formatDate, groupByDay, mergePages } from "./format";
import { ActivityRow, cx, Empty, ErrorState, Preparing, Seg, SkRows, StaleBar } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Riwayat (17 Nov 2026): every activity of mine, by day, filtered by Semua / Harian / Olahraga /
 * Strava. The first 20 come from the cache at once; more load as the list nears its end.
 */

const FILTERS = [["all", "Semua"], ["daily", "Harian"], ["sport", "Olahraga"], ["strava", "Strava"]] as const;
const emptyText: Record<WbMyActivityFilter, string> = {
  all: "Belum ada aktivitas. Tekan Catat untuk mulai.",
  daily: "Belum ada kegiatan harian.",
  sport: "Belum ada olahraga yang dicatat sendiri.",
  strava: "Belum ada aktivitas dari Strava. Sambungan Strava sedang disiapkan.",
};

type More = { key: string; base: string; items: WbMyActivity[]; next: string | null; loading: boolean; failed: string | null };

export function History({ active, filter, onFilter }: { active: boolean; filter: WbMyActivityFilter; onFilter: (filter: WbMyActivityFilter) => void }) {
  const { api, openActivity } = useWellbeing();
  const key = keys.activities(filter);
  const page = useResource(key, () => api.activities(filter));
  const today = useMemo(() => wibToday(), []);
  const [more, setMore] = useState<More>({ key: "", base: "", items: [], next: null, loading: false, failed: null });
  const sentinel = useRef<HTMLDivElement>(null);

  // Extra pages belong to one filter and one first page: a refresh that changes the first page starts over.
  const base = page.data?.items.map(item => item.id).join(",") ?? "";
  const extra = more.key === key && more.base === base ? more : null;
  const items = useMemo(() => mergePages(page.data?.items ?? [], extra?.items ?? []), [page.data, extra]);
  const next = extra ? extra.next : page.data?.next ?? null;
  const loading = extra?.loading ?? false;
  const failed = extra?.failed ?? null;
  const groups = useMemo(() => groupByDay(items), [items]);

  async function loadMore() {
    if (!next || loading) return;
    const current = extra ?? { key, base, items: [], next, loading: false, failed: null };
    setMore({ ...current, loading: true, failed: null });
    try {
      const result = await api.activities(filter, next);
      setMore({ key, base, items: [...current.items, ...result.items], next: result.next, loading: false, failed: null });
    } catch (error) {
      // The cursor is no longer understood (the list changed under it): start again from the top.
      if (error instanceof WellbeingApiError && error.status === 422) {
        setMore({ key: "", base: "", items: [], next: null, loading: false, failed: null });
        void page.reload();
        return;
      }
      setMore({ ...current, loading: false, failed: errorText(error) });
    }
  }
  const onNearEnd = useEffectEvent(() => { void loadMore(); });

  // Near the end of the list, the next page loads by itself (unless the last try failed).
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !active || !next || failed) return;
    const root = element.closest("[data-scroller]");
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) onNearEnd(); }, { root, rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, next, failed]);

  return <>
    <p className={css.largeTitle} aria-hidden="true">Riwayat</p>
    <Seg label="Jenis aktivitas" value={filter} options={FILTERS} onChange={onFilter} style={{ margin: "0 0 16px" }} />
    <StaleBar show={!!page.refreshError} onRetry={() => void page.reload()} />
    {!page.data
      ? page.error ? <ErrorState message={page.error} onRetry={() => void page.reload()} /> : <SkRows rows={6} />
      : !page.data.migrated ? <Preparing />
      : !items.length
        ? <Empty icon={<HistoryIcon size={24} aria-hidden="true" />}>{emptyText[filter]}</Empty>
        : <>
            {groups.map((group, index) => <div key={group.date}>
              <h2 className={css.groupLabel} style={index === 0 ? { marginTop: 0 } : undefined}>
                {dayLabel(group.date, today)}{group.date === today || group.date === addDays(today, -1) ? ` · ${formatDate(group.date, { day: "numeric", month: "short" })}` : ""}
              </h2>
              <div className={cx(css.card, css.list)}>{group.items.map(activity => <ActivityRow key={activity.id} activity={activity} today={today} withDate={false} onOpen={openActivity} />)}</div>
            </div>)}
            {next
              ? <div ref={sentinel} style={{ padding: "16px 0" }}>
                  {failed
                    ? <div className={css.center} role="alert"><p className={cx(css.caption, css.muted)} style={{ marginBottom: 8 }}>{failed}</p><button type="button" className={cx(css.btn, css.btnTonal)} onClick={() => void loadMore()}><RefreshCw size={18} aria-hidden="true" />Muat lagi</button></div>
                    : loading ? <SkRows rows={2} />
                    : <div className={css.center}><button type="button" className={cx(css.btn, css.btnText)} onClick={() => void loadMore()}>Muat lagi</button></div>}
                </div>
              : <p className={cx(css.caption, css.faint, css.center)} style={{ padding: "20px 0" }}>Sudah semua</p>}
          </>}
  </>;
}
