"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { serialLabel } from "@/lib/pra-wam/cards";
import { praWamPath } from "@/lib/routes";
import type { GalleryEntry } from "@/lib/server/pra-wam/colleagues";
import { CardImage } from "./CardImage";
import css from "./colleagues.module.css";

/** "a b" matches "Budi Aris": every word somewhere in the name, department or character. */
const matches = (entry: GalleryEntry, query: string) => {
  const haystack = `${entry.name} ${entry.department} ${entry.card.character.name} ${entry.card.tier.name}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
};

/**
 * Rekan: everyone's card, newest number last, with a search and a filter by character. A tap opens
 * that colleague's card and what they share. The viewer's own card is marked "Kamu".
 */
export function Gallery({ entries, viewerId }: { entries: GalleryEntry[]; viewerId: string }) {
  const [query, setQuery] = useState("");
  const [character, setCharacter] = useState<string | null>(null);
  const characters = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const entry of entries) {
      const { id, name } = entry.card.character;
      counts.set(id, { name, count: (counts.get(id)?.count ?? 0) + 1 });
    }
    return [...counts].map(([id, value]) => ({ id, ...value })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "id"));
  }, [entries]);
  const shown = entries.filter(entry => (!character || entry.card.character.id === character) && (!query.trim() || matches(entry, query)));

  return <div className={css.gallery}>
    <label className={css.search}>
      <Search size={18} aria-hidden />
      <span className="sr-only">Cari nama, departemen, atau karakter</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, departemen, atau karakter" />
    </label>
    {characters.length > 1 && <div className={css.filters} role="group" aria-label="Saring menurut karakter">
      <button type="button" className={css.filter} aria-pressed={!character} onClick={() => setCharacter(null)}>Semua · {entries.length}</button>
      {characters.map(item => <button key={item.id} type="button" className={css.filter} aria-pressed={character === item.id}
        onClick={() => setCharacter(character === item.id ? null : item.id)}>{item.name} · {item.count}</button>)}
    </div>}
    <p className={css.count} role="status">{shown.length === entries.length ? `${entries.length} kartu` : `${shown.length} dari ${entries.length} kartu`}</p>
    {shown.length === 0
      ? <p className={css.empty}>Tidak ada kartu yang cocok.</p>
      : <ul className={css.grid}>
        {shown.map(entry => {
          const mine = entry.employeeId === viewerId;
          return <li key={entry.employeeId}>
            <a className={css.tile} href={praWamPath.colleague(entry.employeeId)} aria-label={`${entry.name}${mine ? " (kamu)" : ""}, ${entry.card.character.name}, ${entry.card.tier.name}, kartu ${serialLabel(entry.card.serial)}`}>
              <CardImage card={entry.card} alt="" />
              <span className={css.who}><b>{entry.name}</b>{mine && <i className={css.you}>Kamu</i>}</span>
              <span className={css.meta}>{entry.card.character.name} · {entry.card.tier.name}</span>
            </a>
          </li>;
        })}
      </ul>}
  </div>;
}
