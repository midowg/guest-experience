"use client";

import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "./Pressable";
import css from "./switch.module.css";

/**
 * Switch (DS #16, "Toggle"): on/off that applies at once. A button with role="switch" and
 * aria-checked; give it a spoken name (`label`) or put it in a SwitchRow, whose text names it.
 * The thumb shows a check when on, so the state is not colour alone.
 */
export function Switch({ checked, onChange, label, labelledBy, describedBy, disabled, id, className }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Spoken name when no visible text names it. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy}
    disabled={disabled} className={cx(css.switch, className)} onClick={() => onChange(!checked)}>
    <span className={css.thumb} aria-hidden><Check /></span>
  </button>;
}

/**
 * A row of text and a Switch (§10.1 SwitchRow): the title names the switch, the line under it
 * describes it, and the whole row toggles it. `inList` for a row inside a List (56 tall, padded).
 * Sakelar "Kabari peserta" in the Ubah jam sheet is one of these.
 */
export function SwitchRow({ title, sub, checked, onChange, disabled, inList, className }: {
  title: ReactNode;
  sub?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  inList?: boolean;
  className?: string;
}) {
  const id = useId();
  return <div className={cx(css.row, inList && css.inList, disabled && css.rowDisabled, className)}
    onClick={event => {
      // A tap anywhere on the row toggles, except on the switch itself (it handles its own click).
      if (disabled || (event.target as Element).closest("button")) return;
      onChange(!checked);
    }}>
    <span className={css.rowText}>
      <span id={`${id}-t`} className={css.rowTitle}>{title}</span>
      {sub && <span id={`${id}-s`} className={css.rowSub}>{sub}</span>}
    </span>
    <Switch checked={checked} onChange={onChange} labelledBy={`${id}-t`} describedBy={sub ? `${id}-s` : undefined} disabled={disabled} />
  </div>;
}
