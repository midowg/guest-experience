"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Button, initials, Sheet, SwitchRow } from "@/components/main-wam/ui";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { listPeople, toggleId } from "@/lib/main-wam/momen/editor";
import css from "./editor-tag-sheet.module.css";

/** The five colours a person without a photo gets (container and ink of the kit's own tokens), by the first letter of the name. */
const TINTS = ["primary", "success", "warning", "neutral", "awarding"] as const;
const tintOf = (name: string) => TINTS[(name.codePointAt(0) ?? 0) % TINTS.length];

/** A person: the profile photo when there is one, else the first letter on a tint. */
export function Person({ person, size }: { person: TagCandidate; size: number }) {
  return <span className={css.avatar} data-tint={tintOf(person.name)} style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }} aria-hidden>
    {initials(person.name).slice(0, 1) || "?"}
    {/* Over the initials: a photo that fails to load shows nothing, so the initials stay. */}
    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses, shown as they are */}
    {person.photo && <img src={person.photo} alt="" loading="lazy" decoding="async" />}
  </span>;
}

/**
 * "Tag orang" (KONTRAK §40): a bottom sheet (about 85 % tall) opened from the editor's tool row. Top to bottom: "Tanya setiap foto", a search, the people
 * chosen as chips (tap to remove) and the one list of everyone (avatar, name, department, a BOD chip; BOD first). No limit. "Selesai" closes it.
 */
export function EditorTagSheet({ open, onClose, candidates, tags, onTags, ask, onAskChange, initialQuery = "" }: {
  open: boolean;
  onClose: () => void;
  candidates: readonly TagCandidate[];
  tags: readonly string[];
  onTags: (next: string[]) => void;
  /** "Tanya setiap foto": on = this sheet opens by itself with each photo. */
  ask: boolean;
  onAskChange: (ask: boolean) => void;
  initialQuery?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const byId = useMemo(() => new Map(candidates.map(person => [person.id, person])), [candidates]);
  const list = useMemo(() => listPeople(candidates, query), [candidates, query]);
  const chosen = tags.filter(id => byId.has(id));

  return <Sheet open={open} onClose={onClose} title={t("momen.edit.tag")} subtitle={t("momen.edit.tagNote")} className={css.sheet}
    footer={<Button block onClick={onClose}>{t("momen.edit.done")}</Button>}>
    <div className={css.body}>
      <SwitchRow className={css.ask} title={t("momen.edit.ask")} sub={t("momen.edit.askSub")} checked={ask} onChange={onAskChange} />
      <div className={css.sticky}>
        <label className={css.search}>
          <Search aria-hidden />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("momen.edit.search")} aria-label={t("momen.edit.searchLabel")} enterKeyHint="search" autoComplete="off" />
        </label>
        <div className={css.countRow}><span className={css.count} aria-live="polite">{t("momen.edit.tagCount", { n: chosen.length })}</span></div>
        {chosen.length > 0 && <ul className={css.chosen} aria-label={t("momen.edit.chosen")}>
          {chosen.map(id => { const person = byId.get(id)!; return <li key={id}>
            <button type="button" className={css.chip} aria-label={t("momen.edit.remove", { name: person.name })} onClick={() => onTags(toggleId(tags, id))}>
              <Person person={person} size={22} /><span>{person.name}</span><X aria-hidden />
            </button>
          </li>; })}
        </ul>}
      </div>
      {list.length > 0
        ? <ul className={css.people} aria-label={t("momen.edit.people")}>
          {list.map(person => { const on = tags.includes(person.id); return <li key={person.id}>
            <button type="button" role="checkbox" aria-checked={on} className={css.person} onClick={() => onTags(toggleId(tags, person.id))}>
              <Person person={person} size={40} />
              <span className={css.personText}><b>{person.name}</b><small>{person.department || "–"}</small></span>
              {person.bod && <span className={css.bod}>{t("momen.edit.bod")}</span>}
              <span className={css.mark} aria-hidden>{on ? <Check /> : null}</span>
            </button>
          </li>; })}
        </ul>
        : <p className={css.none} role="status">{t("momen.edit.none")}</p>}
    </div>
  </Sheet>;
}
