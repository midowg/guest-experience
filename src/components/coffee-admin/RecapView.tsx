"use client";

import { useEffect, useId, useState } from "react";
import { Download, FileSpreadsheet, Search, SlidersHorizontal, X } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { ConsoleButton, ConsoleButtonLink, PageHeader } from "@/components/console";
import { ITEM_KINDS, KIND_LABEL, STATUS_LABEL, type ItemFor, type Status } from "@/lib/coffee/types";
import type { CancelTarget, CoffeeAdminApi, RecapData, RecapQuery } from "./api";
import { DetailTable } from "./DetailTable";
import { monthEnd, monthName, recentMonths } from "./format";
import { Layer } from "./Layer";
import { RecapBreakdown, RecapViewPicker, type RecapView } from "./RecapBreakdown";
import { coffeeAdminSection } from "./sections";
import css from "./coffee-admin.module.css";

type RecapTab = "ringkasan" | "detail";
const STATUS_CHOICES: Status[] = ["selesai", "diproses", "ditolak", "batal"];
const keyOf = (query: RecapQuery) => [query.dari, query.sampai, query.jenis ?? "", query.status ?? "", query.q?.trim() ?? ""].join("|");
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The whole month as Rekap's span. */
export const monthQuery = (month: string): RecapQuery => ({ dari: `${month}-01`, sampai: monthEnd(month) });

function rangeProblem(query: RecapQuery): string {
  if (!isDay(query.dari) || !isDay(query.sampai)) return "Isi tanggal awal dan akhir.";
  const days = (Date.parse(`${query.sampai}T00:00:00Z`) - Date.parse(`${query.dari}T00:00:00Z`)) / 86_400_000;
  if (days < 0) return "Tanggal akhir tidak boleh sebelum tanggal awal.";
  if (days > 366) return "Rentang paling lama satu tahun. Persempit tanggalnya.";
  return "";
}

/**
 * Rekap: a span of days as one row per drink, summed up (Ringkasan) or listed (Detail), and the
 * same rows as files from the server (Unduh CSV, Unduh Excel carry the filter). Every span that
 * was opened is kept: it shows at once when asked again and is refreshed quietly; while a new one
 * is read the old numbers stay, dimmed.
 */
export function RecapView({ api, initial, today, phone, active, version, onCancel }: {
  api: CoffeeAdminApi; initial?: { query: RecapQuery; data: RecapData }; today: string; phone: boolean; active: boolean;
  /** Raised when an order changed, so what is kept is read again the next time Rekap is on screen. */
  version: number;
  /** Batalkan catatan on a record made by hand (the screen that holds Rekap asks first, then cancels). */
  onCancel?: (target: CancelTarget) => void;
}) {
  const uid = useId();
  const section = coffeeAdminSection("rekap");
  const current = today.slice(0, 7);
  const [query, setQuery] = useState<RecapQuery>(() => initial?.query ?? monthQuery(current));
  const [search, setSearch] = useState(query.q ?? "");
  const [tab, setTab] = useState<RecapTab>("ringkasan");
  // Which breakdown Ringkasan shows: kept while Rekap stays mounted, also over Ringkasan and Detail.
  const [lihat, setLihat] = useState<RecapView>("karyawan");
  const [filterSheet, setFilterSheet] = useState(false);
  const [kept, setKept] = useState<Record<string, { data: RecapData; version: number }>>(() => initial ? { [keyOf(initial.query)]: { data: initial.data, version } } : {});
  const [shownKey, setShownKey] = useState(() => initial ? keyOf(initial.query) : "");
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const key = keyOf(query);
  const problem = rangeProblem(query);
  const hit = kept[key];
  const wanted = active && !problem && (!hit || hit.version !== version);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    api.recap(query)
      .then(data => { if (!live) return; setKept(all => ({ ...all, [key]: { data, version } })); setShownKey(key); setFailure(null); })
      .catch((error: unknown) => { if (live) setFailure({ key, message: errorMessage(error) }); });
    return () => { live = false; };
    // `query` is covered by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, version, wanted, attempt]);

  // The search waits for a pause in the typing.
  useEffect(() => {
    const word = search.trim();
    const timer = window.setTimeout(() => setQuery(value => (value.q ?? "") === word ? value : { ...value, q: word || undefined }), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const data = hit?.data ?? kept[shownKey]?.data ?? null;
  const failed = failure?.key === key ? failure.message : "";
  const loading = wanted && !failed;
  const stale = !hit && !!data;
  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const title = hit?.data.title ?? data?.title ?? "";
  const months = recentMonths(current);
  const month = months.find(item => query.dari === `${item}-01` && query.sampai === monthEnd(item)) ?? "";
  const manyMonths = isDay(query.dari) && isDay(query.sampai) && query.dari.slice(0, 7) !== query.sampai.slice(0, 7);
  const filterCount = [!month, !!query.jenis, !!query.status, !!query.q].filter(Boolean).length;
  const set = (patch: Partial<RecapQuery>) => setQuery(value => ({ ...value, ...patch }));
  const clear = () => { setSearch(""); setQuery(monthQuery(current)); };

  const filterFields = (
    <>
      <div className={css.field}>
        <label htmlFor={`${uid}-month`}>Bulan</label>
        <select id={`${uid}-month`} value={month} onChange={event => { if (event.target.value) set(monthQuery(event.target.value)); }}>
          {!month && <option value="">Rentang lain</option>}
          {months.map(item => <option key={item} value={item}>{monthName(item)}</option>)}
        </select>
      </div>
      <div className={css.field}>
        <label htmlFor={`${uid}-from`}>Dari tanggal</label>
        <input id={`${uid}-from`} type="date" max={today} value={query.dari} onChange={event => set({ dari: event.target.value })} aria-invalid={!!problem} aria-describedby={problem ? `${uid}-range` : undefined} />
      </div>
      <div className={css.field}>
        <label htmlFor={`${uid}-to`}>Sampai tanggal</label>
        <input id={`${uid}-to`} type="date" min={query.dari || undefined} value={query.sampai} onChange={event => set({ sampai: event.target.value })} aria-invalid={!!problem} aria-describedby={problem ? `${uid}-range` : undefined} />
      </div>
      <div className={css.field}>
        <label htmlFor={`${uid}-status`}>Status</label>
        <select id={`${uid}-status`} value={query.status ?? ""} onChange={event => set({ status: (event.target.value || undefined) as Status | undefined })}>
          <option value="">Semua status</option>
          {STATUS_CHOICES.map(item => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}
        </select>
      </div>
      <div className={`${css.field} ${css.searchField}`}>
        <label htmlFor={`${uid}-search`}>Cari</label>
        <div className={css.combo}>
          <Search size={18} aria-hidden className={css.comboIcon} />
          <input id={`${uid}-search`} type="search" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama, PIC, minuman, nomor" />
        </div>
      </div>
      {problem && <p id={`${uid}-range`} className={`${css.error} ${css.filterError}`} role="alert">{problem}</p>}
      <div className={css.kindFilter}>
        <span id={`${uid}-kind`}>Jenis</span>
        <div className={css.chips} role="group" aria-labelledby={`${uid}-kind`}>
          {(["", ...ITEM_KINDS] as ("" | ItemFor)[]).map(item => (
            <button key={item || "semua"} type="button" aria-pressed={(query.jenis ?? "") === item} onClick={() => set({ jenis: item || undefined })}>{item ? KIND_LABEL[item] : "Semua"}</button>
          ))}
        </div>
        {filterCount > 0 && <button type="button" className={css.textButton} onClick={clear}>Hapus filter</button>}
      </div>
    </>
  );

  const downloads = problem ? (
    <>
      <ConsoleButton disabled icon={<Download size={18} aria-hidden />}>Unduh CSV</ConsoleButton>
      <ConsoleButton variant="primary" className={css.onPrimary} disabled icon={<FileSpreadsheet size={18} aria-hidden />}>Unduh Excel</ConsoleButton>
    </>
  ) : (
    <>
      <ConsoleButtonLink href={api.exportHref("csv", query)} download icon={<Download size={18} aria-hidden />}>Unduh CSV</ConsoleButtonLink>
      <ConsoleButtonLink variant="primary" href={api.exportHref("xlsx", query)} download icon={<FileSpreadsheet size={18} aria-hidden />}>Unduh Excel</ConsoleButtonLink>
    </>
  );

  return (
    <>
      <PageHeader title={section.label} subtitle={section.summary} actions={<div className={css.headActions}>{downloads}</div>} />

      {phone ? (
        <div className={css.filterBar}>
          <button type="button" className={css.secondary} onClick={() => setFilterSheet(true)} aria-haspopup="dialog">
            <SlidersHorizontal size={18} aria-hidden />Filter{filterCount ? ` · ${filterCount} aktif` : ""}
          </button>
          <span>{title}{query.jenis ? ` · ${KIND_LABEL[query.jenis]}` : ""}</span>
        </div>
      ) : <section className={css.filters} aria-label="Filter rekap">{filterFields}</section>}
      {phone && filterSheet && (
        <Layer onClose={() => setFilterSheet(false)} labelledBy={`${uid}-filter-title`}>
          <div className={css.dialogHead}>
            <h2 id={`${uid}-filter-title`}>Filter rekap</h2>
            <button type="button" className={css.iconButton} aria-label="Tutup" onClick={() => setFilterSheet(false)}><X size={20} aria-hidden /></button>
          </div>
          <div className={css.filterSheet}>{filterFields}</div>
          <div className={css.dialogActions}>
            <button type="button" className={css.primary} onClick={() => setFilterSheet(false)}>{loading || stale ? "Lihat hasil" : `Lihat ${rows.length} baris`}</button>
          </div>
        </Layer>
      )}

      {failed && (
        <div className={css.banner} data-tone="no" role="alert">
          <span>Rekap belum bisa dimuat. {failed}</span>
          <button type="button" className={css.textButton} onClick={() => { setFailure(null); setAttempt(value => value + 1); }}>Coba lagi</button>
        </div>
      )}

      {!summary ? (
        !failed && <div aria-busy="true" aria-label="Memuat rekap" className={css.stack}>
          <div className={css.stats}>{Array.from({ length: 5 }, (_, index) => <span key={index} className={css.skeleton} style={{ height: 92 }} />)}</div>
          <span className={css.skeleton} style={{ height: 320 }} />
        </div>
      ) : (
        <div className={`${css.stack} ${stale ? css.stale : ""}`} aria-busy={loading}>
          <section className={css.stats} aria-label={`Angka ${title}`}>
            <div className={css.stat} data-main="true">
              <span>Total minuman</span><strong>{summary.total}</strong>
              <small>klaim + tamu + tim · rapat</small>
            </div>
            <div className={css.stat}><span>Klaim</span><strong>{summary.klaim}</strong><small>memakai jatah</small></div>
            <div className={css.stat}><span>Tamu</span><strong>{summary.tamu}</strong><small>dari {summary.meetings} rapat</small></div>
            <div className={css.stat}><span>Tim · rapat</span><strong>{summary.tim}</strong><small>tanpa jatah</small></div>
            <div className={css.stat} data-tone="no"><span>Ditolak</span><strong>{summary.refused}</strong><small>jatah tidak terpakai</small></div>
          </section>

          <div className={css.tabs}>
            <div role="tablist" aria-label="Tampilan rekap" onKeyDown={event => {
              // One stop for Tab; the arrows move between the two.
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const next: RecapTab = tab === "ringkasan" ? "detail" : "ringkasan";
              setTab(next);
              document.getElementById(`${uid}-tab-${next}`)?.focus();
            }}>
              {(["ringkasan", "detail"] as RecapTab[]).map(item => (
                <button key={item} type="button" role="tab" id={`${uid}-tab-${item}`} aria-selected={tab === item} aria-controls={`${uid}-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)}>
                  {item === "ringkasan" ? "Ringkasan" : `Detail · ${rows.length} baris`}
                </button>
              ))}
            </div>
            <span className={css.tabsNote}>{title}</span>
          </div>

          {tab === "ringkasan" ? (
            <div id={`${uid}-panel-ringkasan`} role="tabpanel" aria-labelledby={`${uid}-tab-ringkasan`} className={`${css.panel} ${css.summaryPanel}`}>
              <RecapViewPicker value={lihat} onChange={setLihat} />
              <RecapBreakdown view={lihat} summary={summary} title={title} phone={phone} manyMonths={manyMonths} />
            </div>
          ) : (
            <div id={`${uid}-panel-detail`} role="tabpanel" aria-labelledby={`${uid}-tab-detail`} className={css.panel}>
              <DetailTable key={key} rows={rows} phone={phone} onCancel={onCancel} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
