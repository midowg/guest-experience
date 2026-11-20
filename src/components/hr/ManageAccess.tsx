"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserPlus } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, PageHeader, Pill } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { hrApi } from "@/lib/routes";
import type { HrAccessRow } from "@/lib/server/hr/session";
import { ManageTabs } from "./ManageTabs";
import css from "./manage.module.css";

/**
 * Kelola → Akses (20 Nov 2026): who is Admin HR. Given here by another Admin HR, or in Admin WAM →
 * Akun dan peran. Nobody takes their own access away. Someone without an account cannot sign in yet.
 */
export function ManageAccess({ people, meId }: { people: HrAccessRow[]; meId: string }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const admins = people.filter(person => person.hr).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const others = people.filter(person => !person.hr).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const picked = people.find(person => person.employeeId === pick);

  async function set(employeeId: string, on: boolean) {
    setBusy(true); setMessage(null);
    try { const result = await adminRequest(hrApi.manage.access(employeeId), { method: "PUT", body: JSON.stringify({ on }) }); setMessage({ tone: "success", text: result.message }); setPick(""); router.refresh(); }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader title="Akses" subtitle="Admin HR mengelola absensi, wajah terdaftar, dan titik kantor; nanti juga cuti dan lembur." />
    <ManageTabs current="akses" />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <Card title="Tambah Admin HR">
      <form className={css.actions} onSubmit={event => { event.preventDefault(); if (pick) void set(pick, true); }}>
        <label className={`${css.field} ${css.grow}`}>Karyawan
          <select value={pick} onChange={event => setPick(event.target.value)}>
            <option value="">Pilih karyawan</option>
            {others.map(person => <option key={person.employeeId} value={person.employeeId}>{person.name} · {person.department || "Tanpa departemen"}</option>)}
          </select>
        </label>
        <ConsoleButton type="submit" variant="primary" icon={<UserPlus size={16} aria-hidden />} disabled={busy || !pick}>Jadikan Admin HR</ConsoleButton>
      </form>
      {picked && !picked.hasAccount && <p className={css.muted}>Orang ini belum punya akun karyawan, jadi belum bisa masuk. Akun dibuat di Admin WAM → Akun dan peran.</p>}
    </Card>
    <Card title={`Admin HR (${admins.length})`}>
      <ul className={css.rows}>{admins.map(person => <li key={person.employeeId} className={css.row}>
        <div className={css.rowHead}>
          <strong>{person.name}{person.employeeId === meId ? " (kamu)" : ""}</strong>
          <Pill tone="teal"><ShieldCheck size={14} aria-hidden /> Admin HR</Pill>
        </div>
        <p className={css.muted}>{person.department || "Tanpa departemen"}{person.hasAccount ? "" : " · belum punya akun"}</p>
        {person.employeeId !== meId && <div className={css.actions}><ConsoleButton disabled={busy} onClick={() => void set(person.employeeId, false)}>Cabut</ConsoleButton></div>}
      </li>)}</ul>
    </Card>
  </>;
}
