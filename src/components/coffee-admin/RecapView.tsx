"use client";

import { useEffect, useId, useState } from "react";
import { Download, FileSpreadsheet, Search, SlidersHorizontal, X } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { ConsoleButton, ConsoleButtonLink, PageHeader } from "@/components/console";
import { GROUP_LABEL } from "@/lib/coffee/menu";
import { ITEM_KINDS, KIND_LABEL, STATUS_LABEL, type ItemFor, type Status } from "@/lib/coffee/types";
import type { CancelTarget, CoffeeAdminApi, RecapData, RecapQuery } from "./api";
import { DetailTable } from "./DetailTable";
import { monthEnd, monthName, recentMonths } from "./format";
import { Layer } from "./Layer";
import { Dots } from "./QueueCard";
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
            <div id={`${uid}-panel-ringkasan`} role="tabpanel" aria-labelledby={`${uid}-tab-ringkasan`} className={css.summaryGrid}>
              <section className={`${css.panel} ${css.peoplePanel}`} aria-labelledby={`${uid}-people`}>
                <h2 id={`${uid}-people`}>Per orang</h2>
                {manyMonths && <p className={css.small} style={{ marginBottom: 12 }}>Rentang lebih dari satu bulan: yang tampil jumlah klaim saja, tanpa perbandingan dengan jatah bulanan.</p>}
                {!summary.people.length ? <p className={css.small}>Belum ada karyawan untuk ditampilkan.</p> : phone ? (
                  <ul className={css.cardList}>
                    {summary.people.map(({ person, quota, used, team, refused }) => (
                      <li key={person.id}>
                        <span className={css.cardListMain}>
                          <strong>{person.name}</strong>
                          <span>{[GROUP_LABEL[person.group], person.bu].filter(Boolean).join(" · ")}{team ? ` · tim · rapat ${team}` : ""}{refused ? ` · ditolak ${refused}` : ""}</span>
                        </span>
                        {manyMonths
                          ? <span className={css.cardListSide}><strong className={css.num}>{used}</strong> klaim</span>
                          : <span className={css.cardListSide}><Dots used={used} quota={quota} /><span className={css.num}>{quota > 0 && used >= quota ? "Habis" : `${used}/${quota}`}</span></span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={css.tableBox}>
                    <table className={css.table}>
                      <thead><tr><th scope="col">Nama</th><th scope="col">Kelompok</th><th scope="col">BU</th><th scope="col" className={manyMonths ? css.num : undefined}>{manyMonths ? "Klaim" : "Jatah terpakai"}</th><th scope="col" className={css.num}>Tim · rapat</th><th scope="col" className={css.num}>Ditolak</th></tr></thead>
                      <tbody>
                        {summary.people.map(({ person, quota, used, team, refused }) => (
                          <tr key={person.id}>
                            <th scope="row">{person.name}</th>
                            <td>{GROUP_LABEL[person.group]}</td>
                            <td>{person.bu || "–"}</td>
                            {manyMonths ? <td className={css.num}>{used || "–"}</td> : (
                              <td><span className={css.quotaCell}><Dots used={used} quota={quota} /><span className={css.num}>{used}/{quota}</span>{quota > 0 && used >= quota && <span className={css.pill} data-tone="off">Habis</span>}</span></td>
                            )}
                            <td className={css.num}>{team || "–"}</td>
                            <td className={css.num}>{refused || "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <section className={css.panel} aria-labelledby={`${uid}-drinks`}>
                <h2 id={`${uid}-drinks`}>Per minuman</h2>
                <ul className={css.bars}>
                  {summary.drinks.map(item => (
                    <li key={item.drink}>
                      <span className={css.barName}>{item.drink}</span>
                      <span className={css.barTrack} aria-hidden><span style={{ width: `${(item.count / (summary.drinks[0]?.count || 1)) * 100}%` }} /></span>
                      <span className={css.num}>{item.count}</span>
                    </li>
                  ))}
                  {!summary.drinks.length && <li className={css.small} style={{ display: "block" }}>Tidak ada data untuk filter ini.</li>}
                </ul>
              </section>
              <section className={css.panel} aria-labelledby={`${uid}-pic`}>
                <h2 id={`${uid}-pic`}>Per PIC tamu</h2>
                {!summary.pics.length ? <p className={css.small}>Tidak ada tamu untuk filter ini.</p> : phone ? (
                  <ul className={css.cardList}>
                    {summary.pics.map(pic => (
                      <li key={pic.pic}>
                        <span className={css.cardListMain}><strong>{pic.pic}</strong><span>{pic.meetings} rapat · {pic.guests} tamu</span></span>
                        <span className={css.cardListSide}><strong className={css.num}>{pic.drinks}</strong> minuman</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={css.tableBox}>
                    <table className={css.table}>
                      <thead><tr><th scope="col">PIC</th><th scope="col" className={css.num}>Rapat</th><th scope="col" className={css.num}>Tamu (orang)</th><th scope="col" className={css.num}>Minuman</th></tr></thead>
                      <tbody>
                        {summary.pics.map(pic => (
                          <tr key={pic.pic}><th scope="row">{pic.pic}</th><td className={css.num}>{pic.meetings}</td><td className={css.num}>{pic.guests}</td><td className={css.num}>{pic.drinks}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <section className={css.panel} aria-labelledby={`${uid}-bu`}>
                <h2 id={`${uid}-bu`}>Per BU</h2>
                {!summary.bus.length ? <p className={css.small}>Tidak ada data untuk filter ini.</p> : phone ? (
                  <ul className={css.cardList}>
                    {summary.bus.map(bu => (
                      <li key={bu.bu}>
                        <span className={css.cardListMain}><strong>{bu.bu || "Tanpa BU"}</strong><span>Klaim {bu.klaim} · tamu {bu.tamu} · tim · rapat {bu.tim}</span></span>
                        <span className={css.cardListSide}><strong className={css.num}>{bu.total}</strong></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={css.tableBox}>
                    <table className={css.table}>
                      <thead><tr><th scope="col">BU</th><th scope="col" className={css.num}>Klaim</th><th scope="col" className={css.num}>Tamu</th><th scope="col" className={css.num}>Tim · rapat</th><th scope="col" className={css.num}>Total</th></tr></thead>
                      <tbody>
                        {summary.bus.map(bu => (
                          <tr key={bu.bu}><th scope="row">{bu.bu || "Tanpa BU"}</th><td className={css.num}>{bu.klaim}</td><td className={css.num}>{bu.tamu}</td><td className={css.num}>{bu.tim}</td><td className={css.num}><strong>{bu.total}</strong></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className={css.small} style={{ marginTop: 10 }}>Tamu dihitung ke BU PIC-nya.</p>
              </section>
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
