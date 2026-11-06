"use client";

import { useState } from "react";
import type { Leads } from "@/lib/pra-wam/leads";
import css from "./lead-editor.module.css";

type Props = {
  name: string;
  /** What this person heads now. */
  value: Leads;
  /** The departments and BUs to pick from (leadOptions). */
  options: Leads;
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
 * HOD departemen dan lead BU (6 Nov 2026), in Akun dan peran and in Data karyawan: tick the
 * departments this person heads (one or several: Sofyan heads Center of Excellence and Art &
 * Creative Support) and the BUs they lead (Yulia Mekar: BU MRP). The BUs are the five codes.
 * Heading a department makes them HOD, which lets them book a room "sebagai HOD".
 */
export function LeadEditor({ name, value, options, locked, saving = false, disabled = false, onSave, onChange, onCancel, className }: Props) {
  const [departments, setDepartments] = useState(value.departments);
  const [businessUnits, setBusinessUnits] = useState(value.businessUnits);
  const changed = !same(departments, value.departments) || !same(businessUnits, value.businessUnits);
  const buList = [...new Set([...options.businessUnits, ...value.businessUnits])];
  const deptList = [...new Set([...options.departments, ...value.departments])];
  const off = disabled || !!locked;
  const tickDepartment = (item: string) => {
    const next = departments.includes(item) ? departments.filter(entry => entry !== item) : [...departments, item];
    setDepartments(next); onChange?.({ departments: next, businessUnits });
  };
  const tickBu = (item: string) => {
    const next = businessUnits.includes(item) ? businessUnits.filter(entry => entry !== item) : [...businessUnits, item];
    setBusinessUnits(next); onChange?.({ departments, businessUnits: next });
  };

  return <fieldset className={`${css.editor} ${className ?? ""}`}>
    <legend>HOD departemen dan lead BU</legend>
    <p className={css.hint}>{locked ?? "Centang departemen yang dipimpin (boleh lebih dari satu) dan BU yang dipimpin. HOD bisa booking ruang sebagai HOD."}</p>

    <p className={css.head}>HOD departemen</p>
    <ul className={css.checks}>{deptList.map(item => <li key={item}>
      <label className={css.check}>
        <input type="checkbox" checked={departments.includes(item)} disabled={off} aria-label={`HOD ${item}: ${name}`} onChange={() => tickDepartment(item)} />
        <span>{item}</span>
      </label>
    </li>)}</ul>

    <p className={css.head}>Lead BU</p>
    <ul className={css.checks}>{buList.map(item => <li key={item}>
      <label className={css.check}>
        <input type="checkbox" checked={businessUnits.includes(item)} disabled={off} aria-label={`Lead BU ${item}: ${name}`} onChange={() => tickBu(item)} />
        <span>{item}</span>
      </label>
    </li>)}</ul>
    {onSave && <div className={css.actions}>
      <button type="button" className={`${css.button} ${css.primary}`} disabled={off || !changed} onClick={() => onSave({ departments, businessUnits })}>{saving ? "Menyimpan…" : "Simpan HOD dan lead BU"}</button>
      {onCancel && <button type="button" className={css.button} disabled={saving} onClick={onCancel}>Tutup</button>}
    </div>}
  </fieldset>;
}
