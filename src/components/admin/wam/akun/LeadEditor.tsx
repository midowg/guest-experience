"use client";

import { useState } from "react";
import type { LeadOptions, Leads } from "@/lib/pra-wam/leads";
import css from "./lead-editor.module.css";

type Props = {
  name: string;
  /** What this person heads now. */
  value: Leads;
  /** The departments to pick from (leadOptions). */
  options: LeadOptions;
  /** A BOD heads nothing: the lists are locked, with why. */
  locked?: string;
  saving?: boolean;
  disabled?: boolean;
  /** Its own "Simpan" (Akun dan peran); without it the editor only reports changes (`onChange`). */
  onSave?: (leads: Leads) => void;
  /** Inside a larger form (Ubah karyawan): every tick is reported, saved with the rest. */
  onChange?: (leads: Leads) => void;
  /** Closes the editor without saving. */
  onCancel?: () => void;
  className?: string;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every(item => b.includes(item));

/**
 * HOD dan Lead, in Akun dan peran and in Data karyawan: tick the departments this person heads (one
 * or several: Sofyan heads Center of Excellence and Art & Creative Support), or mark them a Lead
 * (9 Nov 2026, was "lead BU"): a team lead in their own department, just under the HOD, whose
 * people point at them in Atasan langsung. Heading a department makes them HOD, which lets them
 * book a room "sebagai HOD". Nobody leads a BU: a BU is only where a person belongs.
 */
export function LeadEditor({ name, value, options, locked, saving = false, disabled = false, onSave, onChange, onCancel, className }: Props) {
  const [departments, setDepartments] = useState(value.departments);
  const [lead, setLead] = useState(value.lead);
  const changed = !same(departments, value.departments) || lead !== value.lead;
  const deptList = [...new Set([...options.departments, ...value.departments])];
  const off = disabled || !!locked;
  const tickDepartment = (item: string) => {
    const next = departments.includes(item) ? departments.filter(entry => entry !== item) : [...departments, item];
    setDepartments(next); onChange?.({ departments: next, lead });
  };
  const tickLead = () => { setLead(!lead); onChange?.({ departments, lead: !lead }); };

  return <fieldset className={`${css.editor} ${className ?? ""}`}>
    <legend>HOD dan Lead</legend>
    <p className={css.hint}>{locked ?? "HOD memimpin departemen (boleh lebih dari satu) dan bisa booking ruang sebagai HOD. Lead memimpin tim di departemennya, tepat di bawah HOD; anggotanya diatur lewat Atasan langsung."}</p>

    <p className={css.head}>Lead</p>
    <ul className={css.checks}><li>
      <label className={css.check}>
        <input type="checkbox" checked={lead} disabled={off} aria-label={`Lead: ${name}`} onChange={tickLead} />
        <span>Lead di departemennya (di bawah HOD)</span>
      </label>
    </li></ul>

    <p className={css.head}>HOD departemen</p>
    <ul className={css.checks}>{deptList.map(item => <li key={item}>
      <label className={css.check}>
        <input type="checkbox" checked={departments.includes(item)} disabled={off} aria-label={`HOD ${item}: ${name}`} onChange={() => tickDepartment(item)} />
        <span>{item}</span>
      </label>
    </li>)}</ul>
    {onSave && <div className={css.actions}>
      <button type="button" className={`${css.button} ${css.primary}`} disabled={off || !changed} onClick={() => onSave({ departments, lead })}>{saving ? "Menyimpan…" : "Simpan HOD dan Lead"}</button>
      {onCancel && <button type="button" className={css.button} disabled={saving} onClick={onCancel}>Tutup</button>}
    </div>}
  </fieldset>;
}
