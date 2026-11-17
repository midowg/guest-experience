"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { IconBox, type IconProp } from "@/components/main-wam/ui";
import css from "./sheets.module.css";

/*
 * Radio groups for Momen's sheets (WAI-ARIA APG radio group): one Tab stop (the chosen row), arrow
 * keys move, Home/End go to the ends, Space/Enter or a tap chooses. PickList: plain rows with a
 * check (Saring sesi, Tag sesi); RadioCards: bordered rows with a dot (alasan laporan, Untuk).
 */

export type PickRow = { value: string; title: ReactNode; sub?: ReactNode; end?: ReactNode; spoken?: string };
export type PickGroup = { head?: string; rows: PickRow[] };

function useRoving(values: string[], value: string | null, onChange: (value: string) => void, chooseOnMove: boolean) {
  const refs = useRef(new Map<string, HTMLButtonElement | null>());
  const stop = values.includes(value ?? "") ? value : values[0];
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    const index = values.indexOf(current);
    const keys: Record<string, number> = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: values.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = values[(keys[event.key] + values.length) % values.length];
    refs.current.get(next)?.focus();
    if (chooseOnMove) onChange(next);
  }
  return { refs, stop, onKeyDown };
}

/** Rows in groups under small heads; the chosen one bold with a check. */
export function PickList({ groups, value, onChange, label }: { groups: PickGroup[]; value: string | null; onChange: (value: string) => void; label: string }) {
  const values = groups.flatMap(group => group.rows.map(row => row.value));
  // Choosing in a sheet closes it: arrows only move here, Space/Enter/tap choose.
  const { refs, stop, onKeyDown } = useRoving(values, value, onChange, false);
  return <div role="radiogroup" aria-label={label} className={css.picklist}>
    {groups.map((group, index) => <div key={group.head ?? `g${index}`} role="group" aria-label={group.head} className={`${css.group} ${group.head ? css.titled : ""}`}>
      {group.head && <h3 className={css.head} aria-hidden>{group.head}</h3>}
      {group.rows.map(row => <button key={row.value} ref={element => { refs.current.set(row.value, element); }} type="button" role="radio" className={css.row}
        aria-checked={row.value === value} aria-label={row.spoken} tabIndex={row.value === stop ? 0 : -1}
        onClick={() => onChange(row.value)} onKeyDown={event => onKeyDown(event, row.value)}>
        <span className={css.text}><span className={css.title}>{row.title}</span>{row.sub && <span className={css.sub}>{row.sub}</span>}</span>
        {row.end !== undefined && <span className={css.end}>{row.end}</span>}
        <Check aria-hidden className={css.mark} />
      </button>)}
    </div>)}
  </div>;
}

export type RadioCard = { value: string; title: ReactNode; sub?: ReactNode; icon?: IconProp };

/** Bordered choices with a dot (and an icon); the dot moves with the arrows, as native radios. */
export function RadioCards({ options, value, onChange, label, invalid, describedBy }: {
  options: RadioCard[]; value: string | null; onChange: (value: string) => void; label: string; invalid?: boolean; describedBy?: string;
}) {
  const { refs, stop, onKeyDown } = useRoving(options.map(option => option.value), value, onChange, true);
  return <div role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={css.cards}>
    {options.map(option => <button key={option.value} ref={element => { refs.current.set(option.value, element); }} type="button" role="radio"
      className={`${css.card} ${option.sub ? css.tall : ""}`} aria-checked={option.value === value} tabIndex={option.value === stop ? 0 : -1}
      onClick={() => onChange(option.value)} onKeyDown={event => onKeyDown(event, option.value)}>
      {option.icon && <IconBox icon={option.icon} />}
      <span className={css.cardText}><span className={css.cardTitle}>{option.title}</span>{option.sub && <span className={css.cardSub}>{option.sub}</span>}</span>
      <span className={css.dot} aria-hidden />
    </button>)}
  </div>;
}

