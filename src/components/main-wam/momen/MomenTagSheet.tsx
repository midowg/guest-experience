"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Button, Pill, Sheet, SwitchRow, TextField } from "@/components/main-wam/ui";
import { PHOTO_TAG_MAX } from "@/lib/main-wam/momen/filters";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { suggestionReason } from "@/lib/main-wam/misi/tags";
import css from "./tag-sheet.module.css";

/** Why a person is suggested for any photo: the roommate, the person next to me on the train, a BOD. */
const reasonOf = (candidate: TagCandidate) => suggestionReason(candidate, "sekamar") ?? suggestionReason(candidate, "sebangku") ?? suggestionReason(candidate, "bod");

/**
 * "Ada siapa di foto ini?" (docs/main-wam/KONTRAK.md §13): the light step after the shutter, before the photo is sent. Optional:
 * "Lewati" (or closing the sheet) sends the photo as it is, "Kirim" sends it with the people chosen, who are told and can lift the tag.
 * Suggestions first (roommate, seatmate on the train, BOD), then everyone, with a name search. The photo is already made; the
 * camera keeps no photo waiting if this sheet is left: closing counts as "Lewati".
 */
export function MomenTagSheet({ open, thumb, candidates, ask, onAskChange, onDone }: {
  open: boolean;
  /** The photo just taken (object URL or a demo picture). */
  thumb: string | null;
  candidates: readonly TagCandidate[];
  /** Whether the step is asked for every photo (the switch at the bottom). */
  ask: boolean;
  onAskChange: (ask: boolean) => void;
  /** The photo goes now, with these people (none when skipped). */
  onDone: (ids: string[]) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(candidates.map(candidate => [candidate.id, candidate])), [candidates]);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => candidates.filter(candidate => !needle || candidate.name.toLowerCase().includes(needle) || candidate.department.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, "id")), [candidates, needle]);
  const suggested = shown.filter(candidate => reasonOf(candidate));
  const others = shown.filter(candidate => !reasonOf(candidate));
  const full = selected.length >= PHOTO_TAG_MAX;
  const toggle = (id: string) => setSelected(current => (current.includes(id) ? current.filter(other => other !== id) : current.length >= PHOTO_TAG_MAX ? current : [...current, id]));
  const finish = (ids: string[]) => { setSelected([]); setQuery(""); onDone(ids); };

  const row = (candidate: TagCandidate) => {
    const on = selected.includes(candidate.id);
    const reason = reasonOf(candidate);
    return <li key={candidate.id}>
      <button type="button" className={css.person} aria-pressed={on} disabled={!on && full} aria-label={t("misi.tag.pick", { name: candidate.name })} onClick={() => toggle(candidate.id)}>
        <span className={css.personText}><b>{candidate.name}</b><small>{candidate.department || "–"}</small></span>
        {reason && <Pill tone="primary">{t(`misi.tag.reason.${reason}` as const)}</Pill>}
        <span className={css.mark} aria-hidden>{on ? <Check /> : null}</span>
      </button>
    </li>;
  };

  return <Sheet open={open} onClose={() => finish([])} title={t("momen.tag.title")} subtitle={t("momen.tag.lead")}
    footer={<div className={css.footer}>
      <Button variant="secondary" onClick={() => finish([])}>{t("momen.tag.skip")}</Button>
      <Button onClick={() => finish(selected)}>{selected.length ? t("momen.tag.sendWith", { n: selected.length }) : t("momen.tag.send")}</Button>
    </div>}>
    <div className={css.body}>
      {thumb && <div className={css.photoRow}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the photo just made on this phone (object URL) or a demo picture */}
        <img className={css.photo} src={thumb} alt={t("momen.tag.photo")} />
        <p className={css.count} aria-live="polite">{t("momen.tag.count", { n: selected.length, max: PHOTO_TAG_MAX })}</p>
      </div>}
      {selected.length > 0 && <ul className={css.picked} aria-label={t("misi.tag.selected")}>
        {selected.map(id => <li key={id}><button type="button" className={css.chip} aria-label={t("misi.tag.remove", { name: byId.get(id)?.name ?? "" })} onClick={() => toggle(id)}>{byId.get(id)?.name ?? "?"}<X aria-hidden /></button></li>)}
      </ul>}
      {full && <p className={css.note}>{t("momen.tag.full", { max: PHOTO_TAG_MAX })}</p>}
      <TextField label={t("misi.tag.searchLabel")} search placeholder={t("misi.tag.search")} value={query} onChange={event => setQuery(event.target.value)} />
      {suggested.length > 0 && <section aria-label={t("misi.tag.suggested")}>
        <h3 className={css.listTitle}>{t("misi.tag.suggested")}</h3>
        <ul className={css.people}>{suggested.map(row)}</ul>
      </section>}
      <section aria-label={t("misi.tag.all")}>
        <h3 className={css.listTitle}>{t("misi.tag.all")}</h3>
        {others.length || suggested.length ? <ul className={css.people}>{others.map(row)}</ul> : <p className={css.note}>{t("misi.tag.none")}</p>}
      </section>
      <SwitchRow title={t("momen.tag.ask")} sub={t("momen.tag.askSub")} checked={ask} onChange={onAskChange} />
    </div>
  </Sheet>;
}
