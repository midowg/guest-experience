"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Trash2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamQuestionnaireApi } from "@/lib/routes";
import type { PurgeStatus } from "@/lib/server/pra-wam/purge";
import hr from "./hr.module.css";

const longDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const WHAT = "jawaban menginap (pertanyaan 33, 7–13, 38), kesehatan (16), alergi dan fobia (14b), dan pairing kamar";

/**
 * Pengaturan → "Penghapusan data menginap": when it happens, what goes, and whether it already
 * went. From the date, opening Admin WAM deletes it; "Hapus sekarang" does the same at once.
 */
export function StayPurge({ status }: { status: PurgeStatus }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const left = status.answers + status.roommates;

  const purge = async () => {
    if (!(await confirm({ title: "Hapus data menginap sekarang?", body: `Yang dihapus permanen: ${WHAT}. Tidak bisa dibatalkan, dan tidak ada salinannya di aplikasi. Ekspor dulu bila HR masih membutuhkannya.`, confirmLabel: "Hapus permanen", danger: true }))) return;
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest(praWamQuestionnaireApi.purge, { method: "POST" });
      setMessage({ tone: "success", text: result.message });
      router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  return <section className={hr.settings} aria-labelledby="stay-purge">
    {confirmDialog}
    <div className={hr.settingsHead}>
      <span className={hr.settingsIcon} aria-hidden><CalendarClock size={20} /></span>
      <h2 id="stay-purge">Penghapusan data menginap</h2>
    </div>
    <p className={hr.lead}>Pada tanggal hapus, aplikasi menghapus permanen {WHAT}. Daftar kamar hotel tetap ada. Setelah itu pertanyaan-pertanyaan tersebut tidak lagi ditanyakan atau dihitung di progres.</p>
    {!status.date
      ? <Notice tone="warning">Tanggal hapus belum diatur. Isi &quot;Tanggal hapus data menginap&quot; di atas (paling lambat 30 hari setelah WAM).</Notice>
      : !status.due
        ? <Notice tone="info">Terjadwal: {longDate(status.date)}, mulai pukul 00.00 WIB, saat Admin WAM dibuka. Saat ini tersimpan {status.answers} jawaban dan {status.roommates} penempatan kamar.</Notice>
        : left
          ? <Notice tone="warning">Tanggal hapus ({longDate(status.date)}) sudah lewat, tetapi masih ada {status.answers} jawaban dan {status.roommates} penempatan kamar.</Notice>
          : <Notice tone="success">Sudah dihapus. Tanggal hapus: {longDate(status.date)}. Tidak ada lagi data menginap, kesehatan, alergi, atau pairing kamar yang tersimpan.</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {status.due && left > 0 && <div><Button type="button" variant="secondary" disabled={busy} onClick={() => void purge()}><Trash2 size={18} aria-hidden /> {busy ? "Menghapus…" : "Hapus sekarang"}</Button></div>}
  </section>;
}
