"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { CLOCK_METHODS, clockMethodHints, clockMethodLabels, type ClockMethod } from "@/lib/hr/attendance";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

/**
 * Metode absen (21 Nov 2026, the pilot): one way for everyone, changed here at once. Each clock-in
 * keeps which way it was taken, so the two can be compared afterwards.
 */
export function MethodSetting({ initial, ready }: { initial: ClockMethod; ready: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [method, setMethod] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<{ method: ClockMethod }>(hrAdminApi.method, { method: "PUT", body: JSON.stringify({ method }) });
      setSaved(method); setMessage({ tone: "success", text: result.message }); router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <Card title="Metode absen">
    {!ready && <Notice tone="info">Pilihan metode menunggu migrasi <code>202611270001_hr_metode_revisi.sql</code>. Sampai itu semua orang memakai Wajah + gerakan.</Notice>}
    <fieldset className={css.methods} disabled={!ready || busy}>
      <legend className="sr-only">Metode absen untuk semua karyawan</legend>
      {CLOCK_METHODS.map(option => <label key={option} className={css.method} data-on={method === option || undefined}>
        <input type="radio" name="metode-absen" checked={method === option} onChange={() => setMethod(option)} />
        <span><strong>{clockMethodLabels[option]}{saved === option ? " · dipakai sekarang" : ""}</strong><span className={css.muted}>{clockMethodHints[option]}</span></span>
      </label>)}
    </fieldset>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className={css.actions}><ConsoleButton variant="primary" disabled={!ready || busy || method === saved} onClick={() => void save()}>Pakai metode ini</ConsoleButton></div>
  </Card>;
}
