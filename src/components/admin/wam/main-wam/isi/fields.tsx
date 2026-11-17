"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Notice } from "@/components/ui";
import { AdminApiError, errorMessage } from "@/components/admin/shared/api";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import { shortDate } from "@/lib/main-wam/admin/labels";
import { amountText, parseAmount } from "@/lib/main-wam/admin/tsv";
import css from "./isi.module.css";

/* Small form pieces shared by the isi acara sheets (agen E). Labels above, errors in words. */

export type Problems = Record<string, string>;

/** A label, the control, then its error or hint. `id` must be the control's id. */
export function Field({ id, label, optional, hint, error, children }: { id: string; label: string; optional?: boolean; hint?: ReactNode; error?: string; children: ReactNode }) {
  return <div className={css.field}>
    <label htmlFor={id}>{label}{optional && <span className={css.optional}> (boleh kosong)</span>}</label>
    {children}
    {error ? <p id={`${id}-error`} className={css.error}>{error}</p> : hint ? <p id={`${id}-hint`} className={css.hint}>{hint}</p> : null}
  </div>;
}
/** aria props for a control in a Field. */
export const described = (id: string, error?: string, hint?: boolean) => ({
  id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

/** A switch with words, the whole row a target. */
export function SwitchRow({ title, sub, checked, disabled, onChange }: { title: string; sub?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={css.switchRow}>
    <span><strong>{title}</strong>{sub && <small>{sub}</small>}</span>
    <span className={css.switch}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className={css.track} aria-hidden />
    </span>
  </label>;
}

/** A few choices on one track (radio buttons). */
export function Choice<T extends string>({ label, name, value, options, onChange, disabled }: {
  label: string; name: string; value: T; options: readonly { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div className={css.field}>
    <span className={css.label} id={`${id}-label`}>{label}</span>
    <div className={css.segmentedField} role="radiogroup" aria-labelledby={`${id}-label`}>
      {options.map(option => <label key={option.value} className={css.segment}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={disabled || option.disabled} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div>
  </div>;
}

/** "Hari 1 · Sen, 4 Jan" for a select. */
export const dayOptionLabel = (dates: readonly string[], date: string) => `Hari ${dates.indexOf(date) + 1} · ${shortDate(date)}`;

/** The days of the event as a select. */
export function DaySelect({ id, dates, value, onChange, error, allowNone }: { id: string; dates: readonly string[]; value: string | null; onChange: (date: string | null) => void; error?: string; allowNone?: boolean }) {
  return <select className="select" {...described(id, error)} value={value ?? ""} onChange={event => onChange(event.target.value || null)}>
    {(allowNone || !value) && <option value="">{allowNone ? "Tanpa tanggal" : "Pilih hari"}</option>}
    {value && !dates.includes(value) && <option value={value}>{value} (di luar hari acara)</option>}
    {dates.map(date => <option key={date} value={date}>{dayOptionLabel(dates, date)}</option>)}
  </select>;
}

/** One person by full name (admin views), typed with suggestions; empty = nobody. */
export function PersonSelect({ id, people, value, onChange, error, placeholder = "Ketik nama karyawan" }: {
  id: string; people: readonly AdminPerson[]; value: string | null; onChange: (id: string | null) => void; error?: string; placeholder?: string;
}) {
  const labelOf = (person: AdminPerson) => `${person.fullName} · ${person.department || "Tanpa departemen"}`;
  const current = people.find(person => person.id === value);
  const [typed, setTyped] = useState(current ? labelOf(current) : "");
  const options = useMemo(() => people.map(person => ({ id: person.id, label: labelOf(person) })), [people]);
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) { setLastValue(value); setTyped(current ? labelOf(current) : ""); }
  return <>
    <input className="input" {...described(id, error)} list={`${id}-list`} value={typed} placeholder={placeholder} autoComplete="off"
      onChange={event => {
        const text = event.target.value;
        setTyped(text);
        const found = options.find(option => option.label === text) ?? (text.trim() ? undefined : null);
        if (found === null) { setLastValue(null); onChange(null); }
        else if (found) { setLastValue(found.id); onChange(found.id); }
      }} />
    <datalist id={`${id}-list`}>{options.map(option => <option key={option.id} value={option.label} />)}</datalist>
  </>;
}

/** A number field that keeps what is typed ("13,6", "1.240") and reports a number, or null when empty. */
export function NumberInput({ id, value, onChange, error, suffix, placeholder, integer = false }: {
  id: string; value: number | null; onChange: (value: number | null) => void; error?: string; suffix?: string; placeholder?: string; integer?: boolean;
}) {
  const [text, setText] = useState(amountText(value));
  const [last, setLast] = useState(value);
  const [unreadable, setUnreadable] = useState(false);
  if (last !== value) { setLast(value); if (parseAmount(text) !== value) { setText(amountText(value)); setUnreadable(false); } }
  const problem = error ?? (unreadable ? (integer ? "Tulis bilangan bulat, misalnya 4." : "Tulis angka, misalnya 13,6.") : undefined);
  const input = <input className="input" {...described(id, problem)} inputMode={integer ? "numeric" : "decimal"} value={text} placeholder={placeholder}
    onChange={event => {
      const raw = event.target.value;
      setText(raw);
      const parsed = parseAmount(raw);
      const bad = parsed === undefined || (integer && parsed !== null && !Number.isInteger(parsed));
      setUnreadable(bad);
      if (!bad) { setLast(parsed); onChange(parsed); }
    }} />;
  return <>
    {suffix ? <div className={css.unit}>{input}<span aria-hidden>{suffix}</span></div> : input}
    {!error && unreadable && <p id={`${id}-error`} className={css.error}>{problem}</p>}
  </>;
}

/** The result of the last action, read out politely (errors at once). */
export type Message = { tone: "success" | "error" | "warning"; text: string } | null;
export function MessageLine({ message }: { message: Message }) {
  return <div aria-live="polite" className={css.message}>{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>;
}

/** Field errors from the server (422 with fieldErrors), as the form's own words. */
export function problemsOf(error: unknown): Problems {
  if (!(error instanceof AdminApiError) || !error.fieldErrors) return {};
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([key, messages]) => [key.replace(/^session\.|^group\./, ""), messages[0]]));
}

/** Runs an action with busy state and a message; returns whether it worked. */
export function useRun(setMessage: (message: Message) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(what: string, action: () => Promise<string | void>, onError?: (error: unknown) => void): Promise<boolean> {
    setBusy(what); setMessage(null);
    try { const text = await action(); if (text) setMessage({ tone: "success", text }); return true; }
    catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); onError?.(problem); return false; }
    finally { setBusy(null); }
  }
  return { busy, run };
}

/** "Main WAM menunggu pembaruan sistem": before the migration nothing can be saved, the page says so plainly. */
export function Waiting({ what, migration }: { what: string; migration: string }) {
  return <Notice tone="warning">{what} menunggu pembaruan sistem (migrasi {migration}). Sampai itu dijalankan, isinya belum bisa disimpan.</Notice>;
}
