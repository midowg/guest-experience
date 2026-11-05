"use client";

import { useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Person } from "@/lib/pra-wam/appraisal";
import styles from "./pra-wam.module.css";
import css from "./people-picker.module.css";

/** A department or BU and its people, for the Departemen list. */
export type PeopleGroup = { id: string; label: string; memberIds: string[] };

type Props = {
  /** Everyone who can be picked (the booking leaves the booker out). */
  people: Person[];
  groups: PeopleGroup[];
  picked: string[];
  onChange: (ids: string[]) => void;
  /** The person filling the form: the list opens on their own department. */
  viewerId?: string;
  /** No more than this many can be picked. */
  max?: number;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");

/**
 * Picking people (5 Nov 2026), for Book ruang and Buat sesi: Departemen as one dropdown, opening on
 * the viewer's own department (from their profile), the name search beside it (name or
 * department), and one list that scrolls down, never sideways: initials, name and department, and
 * + or a check. Tap to add, tap again to take off; "Tambah semua" for the department shown. Enter
 * in the search adds the one person found.
 */
export function PeoplePicker({ people, groups, picked, onChange, viewerId, max }: Props) {
  const uid = useId();
  const [groupId, setGroupId] = useState(() => (viewerId && groups.find(group => group.memberIds.includes(viewerId))?.id) || "");
  const [search, setSearch] = useState("");
  const group = groups.find(item => item.id === groupId);
  const query = search.trim().toLowerCase();
  const shown = people
    .filter(person => (!group || group.memberIds.includes(person.id)) && (!query || person.name.toLowerCase().includes(query) || person.department.toLowerCase().includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const addable = shown.filter(person => !picked.includes(person.id));
  const full = max !== undefined && picked.length >= max;
  const add = (ids: string[]) => onChange([...picked, ...ids].slice(0, max ?? Infinity));

  return <div className={css.picker}>
    <div className={css.finder}>
      <div>
        <label className={styles.label} htmlFor={`${uid}-group`}>Departemen</label>
        <select id={`${uid}-group`} className="select" value={groupId} onChange={event => setGroupId(event.target.value)}>
          <option value="">Semua departemen ({people.length})</option>
          {groups.map(item => <option key={item.id} value={item.id}>{item.label} ({item.memberIds.filter(id => people.some(person => person.id === id)).length})</option>)}
        </select>
      </div>
      <div>
        <label className={styles.label} htmlFor={`${uid}-search`}>Cari nama</label>
        <input id={`${uid}-search`} className="input" type="search" value={search} placeholder={group ? `Cari di ${group.label}` : "Nama atau departemen"}
          onChange={event => setSearch(event.target.value)}
          onKeyDown={event => {
            // Esc clears the search first; only an empty search lets Esc close the sheet.
            if (event.key === "Escape" && search) { event.preventDefault(); event.stopPropagation(); setSearch(""); return; }
            // Enter adds the one person found rather than sending the form.
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (query && addable.length === 1 && !full) { add([addable[0].id]); setSearch(""); }
          }} />
      </div>
    </div>
    {group && addable.length > 1 && <button type="button" className={`button button--secondary ${css.addAll}`} disabled={full}
      onClick={() => add(addable.map(person => person.id))}><Plus size={18} aria-hidden />Tambah semua {group.label} ({addable.length})</button>}
    <ul className={css.list} aria-label="Pilih partisipan">
      {shown.length === 0 && <li className={css.empty}>{query ? "Tidak ada yang cocok. Coba nama lain, atau pilih Semua departemen." : "Belum ada orang di departemen ini."}</li>}
      {shown.map(person => {
        const on = picked.includes(person.id);
        return <li key={person.id}>
          <button type="button" className={css.person} aria-pressed={on} disabled={!on && full}
            onClick={() => on ? onChange(picked.filter(id => id !== person.id)) : add([person.id])}>
            <span className={css.initials} aria-hidden>{initials(person.name)}</span>
            <span className={css.text}><strong>{person.name}</strong><small>{person.department || "Tanpa departemen"}</small></span>
            <span className={css.mark} aria-hidden>{on ? <Check size={18} /> : <Plus size={18} />}</span>
          </button>
        </li>;
      })}
    </ul>
  </div>;
}
