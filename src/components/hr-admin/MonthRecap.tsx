"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, FilterChips, PageHeader, SearchField, useViewPreference, ViewToggle } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { LEAVE_MIGRATION, monthLabel, monthSpan } from "@/lib/hr/leave";
import { cellCodes, cellLabels, countCells, isWeekend, type CellKind, type MonthTable } from "@/lib/hr/recap";
import { hrAdminApi, hrAdminPath } from "@/lib/routes";
import { CellLegend, DayCell } from "./cells";
import css from "./hr-admin.module.css";

type Person = MonthTable["people"][number];
type Filter = "semua" | "telat" | "alpa" | "cuti" | "cek";
const away: CellKind[] = ["cuti", "sakit", "izin", "dinas"];
/** The totals at the end of each row and on each card, in this order. */
const TOTALS: { kind: CellKind | "masuk"; label: string; code: string }[] = [
  { kind: "masuk", label: "Hari masuk", code: "∑" },
  { kind: "telat", label: cellLabels.telat, code: cellCodes.telat },
  { kind: "cuti", label: cellLabels.cuti, code: cellCodes.cuti },
  { kind: "sakit", label: cellLabels.sakit, code: cellCodes.sakit },
  { kind: "izin", label: cellLabels.izin, code: cellCodes.izin },
  { kind: "dinas", label: cellLabels.dinas, code: cellCodes.dinas },
  { kind: "alpa", label: cellLabels.alpa, code: cellCodes.alpa },
];

/**
 * Admin HR → Rekap bulanan (21 Nov 2026, the owner asked for "tabel seperti Excel, berwarna"):
 * everyone who clocks in down the side, every day of the month across, each day one coloured cell
 * with its letter (Hadir, Telat, Cuti, Sakit, Izin, Dinas, Event, WFH, Di luar, Tidak absen, …),
 * and the totals at the end. The name column and the dates stay in view while it scrolls. Tap a
 * cell to open that day in Absen harian. Kartu shows one card per person instead. Find a name,
 * keep only who was late, absent, away, or has something to check; move a month with ‹ ›.
 */
export function MonthRecap({ initial }: { initial: MonthTable }) {
  const [table, setTable] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [view, setView] = useViewPreference("admin-hr-rekap", "tabel");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const span = monthSpan(table.month);
  const thisMonth = table.today.slice(0, 7);

  async function load(month: string) {
    setBusy(true); setProblem(null);
    try {
      const result = await adminRequest<MonthTable>(hrAdminApi.month(month));
      if (result.data) { setTable(result.data); window.history.replaceState(null, "", hrAdminPath.month(month)); }
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const totals = new Map(table.people.map(person => [person.employeeId, countCells(person.cells)]));
  const has = (person: Person, test: (kind: CellKind) => boolean) => person.cells.some(cell => test(cell.kind) && !cell.waiting);
  const tests: Record<Filter, (person: Person) => boolean> = {
    semua: () => true,
    telat: person => has(person, kind => kind === "telat"),
    alpa: person => has(person, kind => kind === "alpa"),
    cuti: person => person.cells.some(cell => away.includes(cell.kind)),
    cek: person => person.cells.some(cell => cell.check || cell.incomplete || cell.kind === "ditolak"),
  };
  const needle = query.trim().toLowerCase();
  const shown = table.people.filter(tests[filter]).filter(person => !needle || `${person.name} ${person.department}`.toLowerCase().includes(needle));
  const count = (key: Filter) => table.people.filter(tests[key]).length;
  const dayLabel = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const total = (person: Person, kind: CellKind | "masuk") => (totals.get(person.employeeId) as Record<string, number>)[kind] ?? 0;

  return <>
    <PageHeader title="Rekap bulanan" subtitle={`Semua karyawan × semua tanggal, berwarna. Telat = masuk setelah ${table.lateAfter.replace(":", ".")}. Ketuk satu kotak untuk membuka harinya.`} />
    {!table.leaveReady && <Notice tone="info">Cuti, sakit, izin, dan dinas yang diajukan karyawan ikut tampil setelah migrasi <code>{LEAVE_MIGRATION}</code>. Sampai itu, yang tampil hanya absen.</Notice>}
    {problem && <Notice tone="error">{problem}</Notice>}
    {!table.since && <Notice tone="info">Belum ada yang absen di WG People, jadi belum ada hari yang dihitung Tidak absen.</Notice>}
    {table.since && table.since > `${table.month}-01` && table.since <= `${table.month}-31` && <Notice tone="info">Absen di WG People dimulai {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${table.since}T12:00:00Z`))}; tanggal sebelumnya dibiarkan kosong, bukan Tidak absen.</Notice>}
    <Card title={monthLabel(table.month)}>
      <div className={css.toolbar}>
        <div className={css.dayPicker}>
          <button type="button" className={css.iconButton} aria-label={`Bulan sebelumnya, ${monthLabel(span.before)}`} disabled={busy} onClick={() => void load(span.before)}><ChevronLeft size={18} /></button>
          <label>Bulan<input type="month" value={table.month} max={thisMonth} onChange={event => event.target.value && void load(event.target.value)} /></label>
          <button type="button" className={css.iconButton} aria-label={`Bulan berikutnya, ${monthLabel(span.after)}`} disabled={busy || table.month >= thisMonth} onClick={() => void load(span.after)}><ChevronRight size={18} /></button>
          {table.month !== thisMonth && <ConsoleButton disabled={busy} onClick={() => void load(thisMonth)}>Bulan ini</ConsoleButton>}
        </div>
        <SearchField label="Cari karyawan" placeholder="Cari nama atau departemen" value={query} onChange={setQuery} />
        <ViewToggle value={view} onChange={setView} />
      </div>
      <div className={css.toolbar}>
        <FilterChips label="Saring" value={filter} onChange={setFilter} chips={[
          { value: "semua", label: "Semua", count: count("semua") },
          { value: "telat", label: "Pernah telat", count: count("telat") },
          { value: "alpa", label: "Ada tidak absen", count: count("alpa") },
          { value: "cuti", label: "Cuti, sakit, izin, dinas", count: count("cuti") },
          { value: "cek", label: "Perlu dicek", count: count("cek") },
        ]} />
      </div>
      <CellLegend />
      {shown.length === 0 ? <p className={css.muted}>Tidak ada yang cocok dengan saringan ini.</p>
        : view === "tabel" ? <div className={css.tableWrap} aria-busy={busy}>
          <table className={css.matrix}>
            <caption className="sr-only">Rekap absen {monthLabel(table.month)}</caption>
            <thead><tr>
              <th scope="col" className={css.who}>Nama</th>
              {table.dates.map(date => <th key={date} scope="col" data-weekend={isWeekend(date) || undefined} data-today={date === table.today || undefined}>
                <span aria-hidden>{dayLabel(date)}<br />{Number(date.slice(8))}</span>
                <span className="sr-only">{new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span>
              </th>)}
              {TOTALS.map(item => <th key={item.kind} scope="col" className={css.total} title={item.label}><span aria-hidden>{item.code}</span><span className="sr-only">{item.label}</span></th>)}
            </tr></thead>
            <tbody>{shown.map(person => <tr key={person.employeeId}>
              <th scope="row" className={css.who}><strong>{person.name}</strong><span>{person.department || "Tanpa departemen"}</span></th>
              {person.cells.map(cell => <td key={cell.date}><DayCell cell={cell} who={person.name} href={hrAdminPath.day(cell.date)} /></td>)}
              {TOTALS.map(item => <td key={item.kind} className={css.total}>{total(person, item.kind) || ""}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
          : <ul className={css.personCards} aria-busy={busy}>{shown.map(person => <li key={person.employeeId} className={css.personCard}>
            <span className={css.who}><strong>{person.name}</strong><span className={css.muted}>{person.department || "Tanpa departemen"}</span></span>
            <div className={css.counts}>{TOTALS.map(item => {
              const value = total(person, item.kind);
              return item.kind === "masuk" ? <span key={item.kind} className={css.cell} data-kind="hadir">{value} hari masuk</span>
                : value ? <span key={item.kind} className={css.cell} data-kind={item.kind}>{value} {item.label.toLowerCase()}</span> : null;
            })}</div>
            <div className={css.strip}>{person.cells.map(cell => <DayCell key={cell.date} cell={cell} who={person.name} href={hrAdminPath.day(cell.date)} />)}</div>
          </li>)}</ul>}
    </Card>
  </>;
}
