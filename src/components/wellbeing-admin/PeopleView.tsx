"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Plus, Square, X } from "lucide-react";
import { Avatar, ConsoleButton, PageHeader, SearchField, SegmentedControl } from "@/components/console";
import { SkeletonRows } from "@/components/app-shell/Panel";
import { useResource } from "@/components/app-shell/resource";
import type { WbPersonRow } from "@/lib/wellbeing/types";
import { monthName, points, wb } from "./api";
import { DimensionBar, Empty, LoadError, Refreshing, WaitingMigration } from "./parts";
import { useWbActions } from "./WellbeingAdmin";
import css from "./wellbeing-admin.module.css";

const norm = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Karyawan (16 Nov 2026): everyone in Data karyawan with their points, this month or all time, the
 * same order as the employees' Peringkat. Pick several (e.g. who came to an office event) and give
 * them points in one go; a row opens the person.
 */
export function PeopleView() {
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const source = wb.people(period);
  const people = useResource(source.key, source.fetch);
  const { openPoints, openPerson } = useWbActions();

  const rows = useMemo(() => {
    const term = norm(search.trim());
    return (people.data?.rows ?? []).filter(row => (!department || row.department === department)
      && (!term || norm(`${row.name} ${row.nickname} ${row.department}`).includes(term)));
  }, [people.data, search, department]);

  function toggle(id: string) {
    setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const allShown = rows.length > 0 && rows.every(row => picked.has(row.id));
  function toggleAll() {
    setPicked(current => { const next = new Set(current); for (const row of rows) { if (allShown) next.delete(row.id); else next.add(row.id); } return next; });
  }
  function stop() { setPicking(false); setPicked(new Set()); }

  return <>
    <PageHeader title="Karyawan" subtitle={period === "month" && people.data?.from ? `Poin ${monthName(people.data.from)} · urutan sama dengan Peringkat karyawan` : "Poin sepanjang waktu · urutan sama dengan Peringkat karyawan"}
      actions={<>
        {!picking && <ConsoleButton icon={<CheckSquare size={18} aria-hidden="true" />} onClick={() => setPicking(true)}>Pilih beberapa</ConsoleButton>}
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => openPoints([...picked])}>Tambah poin</ConsoleButton>
      </>} />
    <div className={css.toolbar}>
      <SegmentedControl label="Periode" value={period} onChange={setPeriod} options={[{ value: "month", label: "Bulan ini" }, { value: "all", label: "Sepanjang waktu" }]} />
      <div className={css.toolbarRight}>
        <label className={css.selectWrap}><span className="sr-only">Divisi</span>
          <select className={css.select} value={department} onChange={event => setDepartment(event.target.value)}>
            <option value="">Semua divisi</option>
            {(people.data?.departments ?? []).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <SearchField label="Cari karyawan" placeholder="Cari nama" value={search} onChange={setSearch} />
      </div>
    </div>
    <Refreshing on={people.refreshing} />
    {people.data && !people.data.migrated && <WaitingMigration />}
    {picking && <div className={css.pickBar} role="region" aria-label="Pilihan">
      <button type="button" className={css.pickAll} onClick={toggleAll}>{allShown ? <CheckSquare size={20} aria-hidden="true" /> : <Square size={20} aria-hidden="true" />}{allShown ? "Lepas semua yang tampil" : "Pilih semua yang tampil"}</button>
      <strong>{picked.size} dipilih</strong>
      <span className={css.pickActions}>
        <ConsoleButton icon={<X size={18} aria-hidden="true" />} onClick={stop}>Selesai</ConsoleButton>
        <ConsoleButton variant="primary" disabled={!picked.size} onClick={() => openPoints([...picked])}>Tambah poin ke {picked.size} orang</ConsoleButton>
      </span>
    </div>}
    {people.error && !people.data ? <LoadError message={people.error} onRetry={() => void people.reload()} />
      : !people.data ? <SkeletonRows rows={8} />
      : !rows.length ? <Empty title="Tidak ada yang cocok">Coba kata lain atau pilih Semua divisi.</Empty>
      : <ol className={css.people} aria-label="Karyawan menurut poin">
          {rows.map(row => <PersonRow key={row.id} row={row} picking={picking} picked={picked.has(row.id)} onPick={() => toggle(row.id)} onOpen={() => openPerson(row.id)} />)}
        </ol>}
  </>;
}

function PersonRow({ row, picking, picked, onPick, onOpen }: { row: WbPersonRow; picking: boolean; picked: boolean; onPick: () => void; onOpen: () => void }) {
  return <li className={css.personRow} data-picked={picked}>
    {picking && <label className={css.pick}><input type="checkbox" checked={picked} onChange={onPick} aria-label={`Pilih ${row.name}`} /></label>}
    <button type="button" className={css.personMain} onClick={picking ? onPick : onOpen}>
      <span className={css.rank}>{row.points > 0 ? row.rank : "–"}</span>
      <Avatar name={row.name} size={40} />
      <span className={css.personText}>
        <strong>{row.nickname || row.name}{!row.active && <small> · nonaktif</small>}</strong>
        <small>{row.nickname && row.nickname !== row.name ? `${row.name} · ` : ""}{row.department || "-"}</small>
      </span>
      <span className={css.personScore}>
        <strong className={row.points ? css.pts : css.ptsZero}>{points(row.points)}</strong>
        <DimensionBar dims={row.dims} />
      </span>
    </button>
  </li>;
}
