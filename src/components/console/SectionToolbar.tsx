import type { ReactNode } from "react";
import { LayoutGrid, Search, Table2 } from "lucide-react";
import css from "./console.module.css";

/*
 * The controls above a list. None keeps state, so a server page can use them as links (`href`)
 * and a client page with callbacks (`onChange`); useViewPreference (storage.ts) remembers Kartu or
 * Tabel per page.
 */

export type SearchFieldProps = {
  /** The field's name for screen readers; the placeholder is only a hint. */
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** For a plain GET form: the query parameter. */
  name?: string;
  id?: string;
};

export function SearchField({ label = "Cari", placeholder = "Cari", value, defaultValue, onChange, name, id }: SearchFieldProps) {
  return <label className={css.searchField}>
    <Search size={18} aria-hidden="true" />
    <span className="sr-only">{label}</span>
    <input type="search" className={css.searchInput} id={id} name={name} placeholder={placeholder} autoComplete="off"
      value={value} defaultValue={defaultValue} onChange={onChange ? event => onChange(event.target.value) : undefined} />
  </label>;
}

/**
 * A section's title with a muted count, then on the right the search, a filter control and the
 * view toggle (each optional), and anything else in `children`. Wraps below on a phone.
 */
export function SectionToolbar({ title, count, headingLevel = 2, search, filter, view, children }: {
  title: ReactNode; count?: ReactNode; headingLevel?: 2 | 3; search?: SearchFieldProps; filter?: ReactNode; view?: ReactNode; children?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return <div className={css.toolbar}>
    <div className={css.toolbarTitle}><Heading>{title}</Heading>{count != null && <span className={css.count}>{count}</span>}</div>
    {(search || filter || view || children) && <div className={css.toolbarTools}>
      {search && <SearchField {...search} />}
      {filter}
      {children}
      {view}
    </div>}
  </div>;
}

export type SegmentOption<T extends string> = { value: T; label: string; icon?: ReactNode; href?: string };

/**
 * A few choices on one track (Kartu/Tabel, Hari/Minggu). With `href` each is a link (the current one
 * has aria-current); otherwise a button with aria-pressed that calls `onChange`.
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: { label: string; options: readonly SegmentOption<T>[]; value: T; onChange?: (value: T) => void }) {
  return <div className={css.segmented} role="group" aria-label={label}>
    {options.map(option => option.href
      ? <a key={option.value} href={option.href} className={css.segment} aria-current={option.value === value ? "true" : undefined}>{option.icon}{option.label}</a>
      : <button key={option.value} type="button" className={css.segment} aria-pressed={option.value === value} onClick={() => onChange?.(option.value)}>{option.icon}{option.label}</button>)}
  </div>;
}

export type ConsoleView = "kartu" | "tabel";

/** Kartu or Tabel. */
export function ViewToggle({ value, onChange, hrefs }: { value: ConsoleView; onChange?: (value: ConsoleView) => void; hrefs?: Record<ConsoleView, string> }) {
  return <SegmentedControl label="Tampilan" value={value} onChange={onChange} options={[
    { value: "kartu", label: "Kartu", icon: <LayoutGrid size={16} aria-hidden="true" />, href: hrefs?.kartu },
    { value: "tabel", label: "Tabel", icon: <Table2 size={16} aria-hidden="true" />, href: hrefs?.tabel },
  ]} />;
}

export type FilterChip<T extends string> = { value: T; label: string; count?: number | string; href?: string };

/** One filter at a time as pills; the chosen one is dark. Links with `href`, buttons otherwise. */
export function FilterChips<T extends string>({ label, chips, value, onChange }: { label: string; chips: readonly FilterChip<T>[]; value: T; onChange?: (value: T) => void }) {
  return <div className={css.chips} role="group" aria-label={label}>
    {chips.map(chip => {
      const inner = <>{chip.label}{chip.count != null && <span className={css.chipCount}>{chip.count}</span>}</>;
      return chip.href
        ? <a key={chip.value} href={chip.href} className={css.chip} aria-current={chip.value === value ? "true" : undefined}>{inner}</a>
        : <button key={chip.value} type="button" className={css.chip} aria-pressed={chip.value === value} onClick={() => onChange?.(chip.value)}>{inner}</button>;
    })}
  </div>;
}
