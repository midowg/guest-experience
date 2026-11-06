"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
  saving: boolean;
  disabled: boolean;
  onSave: (leads: Leads) => void;
  /** Data karyawan: closes the editor without saving. */
  onCancel?: () => void;
  className?: string;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every(item => b.includes(item));

/**
 * HOD departemen dan lead BU (6 Nov 2026), in Akun dan peran and in Data karyawan: tick the
 * departments this person heads (one or several: Sofyan heads Center of Excellence and Art &
 * Creative Support) and the BUs they lead (Yulia Mekar: BU Maha Raja Pratama). A BU not listed yet
 * can be typed in. Heading a department makes them HOD, which opens Meeting HOD in Book.
 */
export function LeadEditor({ name, value, options, locked, saving, disabled, onSave, onCancel, className }: Props) {
  const [departments, setDepartments] = useState(value.departments);
  const [businessUnits, setBusinessUnits] = useState(value.businessUnits);
  const [extraBu, setExtraBu] = useState<string[]>([]);
  const [newBu, setNewBu] = useState("");
  const changed = !same(departments, value.departments) || !same(businessUnits, value.businessUnits);
  const toggle = (list: string[], set: (next: string[]) => void, item: string) => set(list.includes(item) ? list.filter(entry => entry !== item) : [...list, item]);
  const buList = [...new Set([...options.businessUnits, ...value.businessUnits, ...extraBu])];
  const deptList = [...new Set([...options.departments, ...value.departments])];
  const off = disabled || !!locked;

  function addBu() {
    const bu = newBu.trim().replace(/\s+/g, " ");
    if (!bu) return;
    if (!buList.includes(bu)) setExtraBu(current => [...current, bu]);
    if (!businessUnits.includes(bu)) setBusinessUnits(current => [...current, bu]);
    setNewBu("");
  }

  return <fieldset className={`${css.editor} ${className ?? ""}`}>
    <legend>HOD departemen dan lead BU</legend>
    <p className={css.hint}>{locked ?? "Centang departemen yang dipimpin (boleh lebih dari satu) dan BU yang dipimpin. HOD melihat Meeting HOD di Book."}</p>

    <p className={css.head}>HOD departemen</p>
    <ul className={css.checks}>{deptList.map(item => <li key={item}>
      <label className={css.check}>
        <input type="checkbox" checked={departments.includes(item)} disabled={off} aria-label={`HOD ${item}: ${name}`} onChange={() => toggle(departments, setDepartments, item)} />
        <span>{item}</span>
      </label>
    </li>)}</ul>

    <p className={css.head}>Lead BU</p>
    <ul className={css.checks}>{buList.map(item => <li key={item}>
      <label className={css.check}>
        <input type="checkbox" checked={businessUnits.includes(item)} disabled={off} aria-label={`Lead BU ${item}: ${name}`} onChange={() => toggle(businessUnits, setBusinessUnits, item)} />
        <span>{item}</span>
      </label>
    </li>)}</ul>
    <div className={css.add}>
      <input className={css.input} value={newBu} maxLength={120} disabled={off} placeholder="BU lain, mis. Maha Raja Pratama" aria-label="Nama BU baru"
        onChange={event => setNewBu(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addBu(); } }} />
      <button type="button" className={css.button} disabled={off || !newBu.trim()} onClick={addBu}><Plus size={16} aria-hidden />Tambah BU</button>
    </div>

    <div className={css.actions}>
      <button type="button" className={`${css.button} ${css.primary}`} disabled={off || !changed} onClick={() => onSave({ departments, businessUnits })}>{saving ? "Menyimpan…" : "Simpan HOD dan lead BU"}</button>
      {onCancel && <button type="button" className={css.button} disabled={saving} onClick={onCancel}>Tutup</button>}
    </div>
  </fieldset>;
}
