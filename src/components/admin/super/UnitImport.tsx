"use client";

import { useState } from "react";
import { Network, Upload } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamUnitsApi } from "@/lib/routes";
import type { Membership, Unit } from "@/lib/server/pra-wam/units";
import styles from "@/components/admin/admin.module.css";

type People = { id: string; name: string }[];
type Message = { tone: "success" | "error"; text: string; list?: string[] } | null;

/**
 * Data karyawan → Unit dan jabatan: the units with their people and leads (HOD), imported from the
 * "Unit dan jabatan" sheet of the Data karyawan workbook. Super admin only, since it matches people
 * by NIP; it writes units, memberships and leads, never Data karyawan's own fields.
 */
export function UnitImport({ initialUnits, initialMemberships, migrated, people }: { initialUnits: Unit[]; initialMemberships: Membership[]; migrated: boolean; people: People }) {
  const [units, setUnits] = useState(initialUnits);
  const [memberships, setMemberships] = useState(initialMemberships);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [confirm, confirmDialog] = useConfirm();
  const name = (id: string) => people.find(person => person.id === id)?.name ?? "Tanpa nama";

  async function upload() {
    if (!file || busy) return;
    // The import replaces every membership, so it is confirmed once units already exist.
    if (units.length > 0 && !(await confirm({
      title: "Ganti semua keanggotaan unit?",
      body: "Semua unit, anggota, dan lead (HOD) diganti dengan isi sheet. Peran HOD ikut berubah sesuai sheet.",
      confirmLabel: "Impor dan ganti",
    }))) return;
    setBusy(true); setMessage(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const result = await adminRequest<{ units: Unit[]; memberships: Membership[]; unmatched: string[]; skipped: string[] }>(praWamUnitsApi, { method: "POST", body });
      if (result.data) { setUnits(result.data.units); setMemberships(result.data.memberships); }
      setMessage({ tone: "success", text: result.message, list: [...(result.data?.unmatched ?? []).map(item => `Tidak ditemukan di Data karyawan: ${item}`), ...(result.data?.skipped ?? [])] });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <section className="stack" aria-labelledby="units-title">
    {confirmDialog}
    <h2 id="units-title" className={styles.superSectionTitle}><Network size={20} aria-hidden="true" /> Unit dan jabatan (dari sheet Data karyawan)</h2>
    {!migrated ? <Notice tone="warning">Unit menunggu migrasi 202611040003_pra_wam_events_units.sql.</Notice> : <>
      <p className={styles.lead}>Unggah berkas Data karyawan yang punya sheet <strong>Unit dan jabatan</strong> (kolom NIP, Nama panggilan, Jenis unit, Unit, Jabatan di unit, Utama). Orang dicocokkan dengan NIP, lalu nama panggilan. Satu orang boleh ada di beberapa unit; baris &ldquo;Lead departemen&rdquo; atau &ldquo;Lead BU&rdquo; menjadikannya lead. Impor mengganti semua keanggotaan dengan isi sheet. Daftar karyawan di atas tidak berubah, dan berkasnya tidak disimpan.</p>
      <Field name="units-file" label="Berkas Excel unit dan jabatan (.xlsx)" hint="Boleh berkas yang sama dengan impor HR, asalkan ada sheet Unit dan jabatan.">
        <input id="units-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-describedby="units-file-hint" onChange={change => { setFile(change.target.files?.[0] ?? null); setMessage(null); }} />
      </Field>
      <div className={styles.qrActions}>
        <Button type="button" variant="secondary" disabled={busy || !file} onClick={upload}><Upload size={17} aria-hidden="true" /> {busy ? "Mengimpor…" : "Impor unit dan jabatan"}</Button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}{message.list?.length ? <ul>{message.list.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}
      {units.length > 0 ? <div className={styles.tableWrap}><table className={styles.table}>
        <caption className="sr-only">Unit dan lead</caption>
        <thead><tr><th scope="col">Unit</th><th scope="col">Lead</th><th scope="col">Anggota</th></tr></thead>
        <tbody>{units.map(unit => {
          const members = memberships.filter(member => member.unitId === unit.id);
          const leads = members.filter(member => member.isLead).map(member => name(member.employeeId));
          return <tr key={unit.id}>
            <td><strong>{unit.name}</strong>{unit.code && unit.code !== unit.name ? ` (${unit.code})` : ""}<p className="field-hint">{unit.kind === "bu" ? "BU" : "Departemen"}</p></td>
            <td>{leads.length ? leads.join(", ") : "Belum ditentukan"}</td>
            <td>{members.length}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="field-hint">Belum ada unit. Impor sheet Unit dan jabatan di atas.</p>}
    </>}
  </section>;
}
