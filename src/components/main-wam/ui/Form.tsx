"use client";

import { useId, type InputHTMLAttributes, type MouseEventHandler, type ReactNode, type TextareaHTMLAttributes } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useT, Words } from "@/components/main-wam/i18n";
import { cx, KitIcon, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./form.module.css";

type Common = {
  /** The visible label above the field (also its name). */
  label: ReactNode;
  /** "(opsional)" after the label. */
  optional?: boolean;
  /** One short line under the field. */
  help?: ReactNode;
  /** An error in words, under the field (the field gets aria-invalid and a red line). */
  error?: ReactNode;
  /** Show "12/300" under the field (needs maxLength or countMax). */
  showCount?: boolean;
  /** Counted against this when there is no hard maxLength. */
  countMax?: number;
  icon?: IconProp;
  className?: string;
};

type InputProps = Common & { multiline?: false; suffix?: ReactNode; search?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;
type AreaProps = Common & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

/**
 * A text field with its label above, help or error under it (DS #14 Input, #15 TextArea): label,
 * help and error are tied to the control (for, aria-describedby, aria-invalid), errors are words
 * (never colour alone), and what was typed is never lost on an error. `multiline` for a text area,
 * `search` for the soft search look, `suffix` for a unit ("menit").
 */
/** "1.000": the counter's numbers as Indonesian writes them (T01: "90/1.000", T-D02). */
const count = (value: number) => value.toLocaleString("id-ID");

export function TextField(props: InputProps | AreaProps) {
  const { label, optional, help, error, showCount, countMax, icon, className, ...rest } = props;
  const id = useId();
  const controlId = rest.id ?? `${id}-c`;
  const helpId = help ? `${id}-h` : undefined;
  const errorId = error ? `${id}-e` : undefined;
  const describedBy = [errorId, helpId, rest["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  const max = countMax ?? (typeof rest.maxLength === "number" ? rest.maxLength : undefined);
  const length = typeof rest.value === "string" ? Array.from(rest.value).length : typeof rest.defaultValue === "string" ? Array.from(rest.defaultValue).length : 0;
  const over = max !== undefined && length > max;

  let control: ReactNode;
  if (props.multiline) {
    const { multiline: _multiline, ...area } = rest as AreaProps;
    void _multiline;
    control = <div className={cx(css.box, css.area, !!error && css.boxError, area.disabled && css.boxDisabled)}>
      <KitIcon icon={icon} />
      <textarea {...area} id={controlId} className={css.control} aria-invalid={error ? true : area["aria-invalid"]} aria-describedby={describedBy} />
    </div>;
  } else {
    const { multiline: _multiline, suffix, search, ...input } = rest as InputProps;
    void _multiline;
    control = <div className={cx(css.box, search && css.search, !!error && css.boxError, input.disabled && css.boxDisabled)}>
      <KitIcon icon={icon} />
      <input {...input} id={controlId} className={css.control} aria-invalid={error ? true : input["aria-invalid"]} aria-describedby={describedBy} />
      {suffix && <span className={css.suffix}>{suffix}</span>}
    </div>;
  }

  return <div className={cx(css.field, className)}>
    <label htmlFor={controlId} className={css.label}>{label}{optional && <span className={css.optional}> (opsional)</span>}</label>
    {control}
    {(error || help || (showCount && max !== undefined)) && <div className={css.foot}>
      <div>
        {error && <p id={errorId} className={cx(css.help, css.error)}><CircleAlert aria-hidden />{error}</p>}
        {help && <p id={helpId} className={css.help}>{help}</p>}
      </div>
      {showCount && max !== undefined && <span className={cx(css.count, over && css.countOver)} aria-live="polite">
        {count(length)}/{count(max)}<span className={shared.srOnly}><Words k="ui.charactersSr" /></span>
      </span>}
    </div>}
  </div>;
}

/**
 * A field whose value is chosen in a sheet ("isian pilih", §10.1): looks like an input with ▾, a
 * button (or link) that opens the choices. Shows `placeholder` dimmed while nothing is chosen.
 */
export function SelectField({ label, value, placeholder = "Pilih", onClick, href, expanded, error, help, icon, optional, className }: {
  label: string;
  value?: ReactNode;
  placeholder?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  href?: string;
  expanded?: boolean;
  error?: ReactNode;
  help?: ReactNode;
  icon?: IconProp;
  optional?: boolean;
  className?: string;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-e` : null, help ? `${id}-h` : null].filter(Boolean).join(" ") || undefined;
  const inner = <>
    <KitIcon icon={icon} />
    <span className={cx(css.selectValue, !value && css.placeholder)}>{value ?? placeholder}</span>
    <ChevronDown aria-hidden />
  </>;
  const boxClass = cx(css.box, css.select, !!error && css.boxError);
  return <div className={cx(css.field, className)}>
    <span id={`${id}-l`} className={css.label}>{label}{optional && <span className={css.optional}> (opsional)</span>}</span>
    {href
      ? <Link href={href} className={boxClass} aria-labelledby={`${id}-l ${id}-v`} aria-describedby={describedBy}><span id={`${id}-v`} hidden>{value ?? placeholder}</span>{inner}</Link>
      : <button type="button" className={boxClass} onClick={onClick} aria-haspopup="dialog" aria-expanded={expanded ?? false}
        aria-labelledby={`${id}-l ${id}-v`} aria-describedby={describedBy}>
        <span id={`${id}-v`} hidden>{value ?? placeholder}</span>{inner}
      </button>}
    {(error || help) && <div className={css.foot}><div>
      {error && <p id={`${id}-e`} className={cx(css.help, css.error)}><CircleAlert aria-hidden />{error}</p>}
      {help && <p id={`${id}-h`} className={css.help}>{help}</p>}
    </div></div>}
  </div>;
}

export type DayTab = { key: string; day: string; date: string; today?: boolean; href?: string };

/**
 * DayTabs (DS #8): the four days of WAM ("Hari 1 · Sen, 4 Jan"). Links (`href`, the day in the
 * address, aria-current) or buttons (`onSelect`, aria-pressed). Today has a dot and is said
 * ("…, hari ini"); the chosen day is the inverse surface.
 */
export function DayTabs({ days, current, onSelect, label, className }: {
  days: DayTab[];
  current: string;
  onSelect?: (key: string) => void;
  label?: string;
  className?: string;
}) {
  const t = useT();
  return <nav aria-label={label ?? t("ui.eventDays")} className={cx(css.tabs, className)}>
    {days.map(day => {
      const chosen = day.key === current;
      const body = <><span className={css.tabDay}>{day.day}</span><span className={css.tabDate}>{day.date}</span>{day.today && <span className={shared.srOnly}><Words k="ui.todaySr" /></span>}</>;
      const tabClass = cx(css.tab, day.today && css.today);
      return day.href
        ? <Link key={day.key} href={day.href} className={tabClass} aria-current={chosen ? "page" : undefined}>{body}</Link>
        : <button key={day.key} type="button" className={tabClass} aria-pressed={chosen} onClick={() => onSelect?.(day.key)}>{body}</button>;
    })}
  </nav>;
}
