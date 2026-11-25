"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GROUP_LABEL } from "@/lib/coffee/menu";
import type { CoffeePerson } from "@/lib/coffee/types";
import css from "./coffee-admin.module.css";

/** Pick an active employee by typing a name, a position or a BU (a combobox: arrows, Enter, Escape). */
export function PersonPicker({ id, label, value, onChange, people, loading, error }: {
  id: string; label: string; value: CoffeePerson | null; onChange: (person: CoffeePerson | null) => void; people: CoffeePerson[]; loading?: boolean; error?: string;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const word = query.trim().toLowerCase();
    return people.filter(person => !word || `${person.name} ${person.nickname} ${person.position} ${person.bu}`.toLowerCase().includes(word)).slice(0, 8);
  }, [people, query]);
  const choose = (person: CoffeePerson) => { onChange(person); setQuery(person.name); setOpen(false); };
  return (
    <div className={css.field}>
      <label htmlFor={id}>{label}</label>
      <div className={css.combo}>
        <Search size={18} aria-hidden className={css.comboIcon} />
        <input
          id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          value={query} placeholder={loading ? "Memuat daftar karyawan…" : "Ketik nama, jabatan, atau BU"} autoComplete="off"
          onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); if (value) onChange(null); }}
          onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={event => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(index => Math.min(results.length - 1, index + 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
            if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
            if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); setOpen(false); }
          }}
        />
        {open && (
          <ul id={`${id}-list`} role="listbox" className={css.comboList} aria-label={label}>
            {results.length ? results.map((person, index) => (
              <li
                key={person.id} id={`${id}-${index}`} role="option" aria-selected={index === active}
                onMouseDown={event => { event.preventDefault(); choose(person); }} onMouseEnter={() => setActive(index)}
              >
                <strong>{person.name}</strong>
                <span>{[person.position, person.bu, GROUP_LABEL[person.group]].filter(Boolean).join(" · ")}</span>
              </li>
            )) : <li className={css.comboEmpty} role="presentation">{loading ? "Memuat daftar karyawan…" : "Tidak ada nama yang cocok"}</li>}
          </ul>
        )}
      </div>
      {error && <p id={`${id}-error`} className={css.error}>{error}</p>}
    </div>
  );
}
