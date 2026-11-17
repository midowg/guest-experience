"use client";

import { useId, useMemo, useState } from "react";
import { Pill } from "@/components/console";
import { searchPeople, type AdminPerson } from "@/lib/main-wam/admin/people";
import css from "./isi.module.css";

/**
 * Picking members from Data karyawan (full names): search by name or department, tick people, see
 * where each one is now ("Kelompok 3 · Kawi"), and show only those without a place yet. Someone
 * placed elsewhere can still be ticked: saving moves them (the sheet says so).
 */
export function PeoplePicker({ people, selected, original = [], onChange, placeOf, nobodyLabel = "Belum punya kelompok", label = "Anggota" }: {
  people: readonly AdminPerson[];
  selected: readonly string[];
  /** Who was in it when the sheet opened (unticking them is said). */
  original?: readonly string[];
  onChange: (ids: string[]) => void;
  /** Where a person is now (another kelompok), or null. */
  placeOf: (id: string) => string | null;
  nobodyLabel?: string;
  label?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const found = searchPeople(people, query).filter(person => !onlyFree || chosen.has(person.id) || !placeOf(person.id));
    // The ticked first, then by name, so the members stay in view.
    return [...found].sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || a.fullName.localeCompare(b.fullName, "id"));
  }, [people, query, onlyFree, chosen, placeOf]);
  const free = people.filter(person => !placeOf(person.id) && !chosen.has(person.id) && !original.includes(person.id)).length;
  const toggle = (personId: string) => onChange(chosen.has(personId) ? selected.filter(item => item !== personId) : [...selected, personId]);

  return <div className={css.picker} role="group" aria-labelledby={`${id}-label`}>
    <div className={css.sectionHead}>
      <span className={css.label} id={`${id}-label`}>{label} <span className={css.optional}>({selected.length} dipilih)</span></span>
      {selected.length > 0 && <button type="button" className={css.textButton} onClick={() => onChange([])}>Kosongkan</button>}
    </div>
    <div className={css.pickerTools}>
      <input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama atau departemen" aria-label={`Cari ${label.toLowerCase()}`} />
      <label className={css.switchRow}>
        <span><strong>{nobodyLabel}</strong><small>{free} orang</small></span>
        <span className={css.switch}>
          <input type="checkbox" role="switch" checked={onlyFree} onChange={event => setOnlyFree(event.target.checked)} />
          <span className={css.track} aria-hidden />
        </span>
      </label>
    </div>
    {shown.length ? <ul className={css.pickerList} aria-label={`Daftar ${label.toLowerCase()}`}>
      {shown.map(person => {
        const place = placeOf(person.id);
        return <li key={person.id}>
          <label className={`${css.pick} ${place && chosen.has(person.id) ? css.pickWarn : ""}`}>
            <input type="checkbox" checked={chosen.has(person.id)} onChange={() => toggle(person.id)} />
            <span><strong>{person.fullName}</strong><small>{person.department || "Tanpa departemen"}</small></span>
            {place ? <em>{chosen.has(person.id) ? `Pindah dari ${place}` : place}</em>
              : chosen.has(person.id) ? <span aria-hidden /> : original.includes(person.id) ? <em>Dikeluarkan</em> : <Pill tone="warn">{nobodyLabel}</Pill>}
          </label>
        </li>;
      })}
    </ul> : <p className={css.small}>Tidak ada nama yang cocok.</p>}
  </div>;
}
