"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { LEAVE_MIGRATION } from "@/lib/hr/leave";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

/**
 * Jam masuk (21 Nov 2026): a masuk after this time, in the office's own zone, is Telat in Absen
 * harian and Rekap bulanan (09.00 to start with, the owner's choice). Only the colouring changes;
 * nothing is refused or recorded differently.
 */
export function LateSetting({ initial, ready }: { initial: string; ready: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [time, setTime] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<{ time: string }>(hrAdminApi.lateAfter, { method: "PUT", body: JSON.stringify({ time }) });
      setSaved(time); setMessage({ tone: "success", text: result.message }); router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <Card title="Jam masuk">
    <p className={css.muted}>Absen masuk setelah jam ini (zona waktu kantornya) diwarnai <strong>Telat</strong> di Absen harian dan Rekap bulanan. Sekarang: setelah {saved.replace(":", ".")}.</p>
    {!ready && <Notice tone="info">Mengubah jam masuk menunggu migrasi <code>{LEAVE_MIGRATION}</code>. Sampai itu telat dihitung setelah 09.00.</Notice>}
    <div className={css.actions}>
      <label className={css.field}>Telat setelah<input type="time" value={time} disabled={!ready || busy} onChange={event => setTime(event.target.value)} /></label>
      <ConsoleButton variant="primary" disabled={!ready || busy || !time || time === saved} onClick={() => void save()}>Simpan</ConsoleButton>
    </div>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
  </Card>;
}
