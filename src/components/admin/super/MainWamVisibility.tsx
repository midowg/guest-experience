"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { MAIN_WAM_VISIBILITY_MIGRATION, type MainWamVisibility } from "@/lib/main-wam-visibility";
import { MAIN_WAM_VISIBILITY_API } from "@/lib/routes";
import css from "./home-style.module.css";

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Super admin → Halaman utama → Main WAM (20 Nov 2026, keputusan pemilik): Main WAM (the app during WAM
 * itself, Kuis live included) stays out of sight in Journey until it is shown here. Only the super admin
 * sees this switch; it is recorded with who and when.
 */
export function MainWamVisibilitySettings({ initial }: { initial: MainWamVisibility }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function change(shown: boolean) {
    const sure = shown
      ? window.confirm("Tampilkan Main WAM di Journey? Menu Main WAM muncul di Admin WAM untuk semua admin, /wam membuka Main WAM sesuai mode acaranya, dan notifikasi Main WAM terkirim ke semua yang bisa membukanya.")
      : window.confirm("Sembunyikan Main WAM lagi? Menu Main WAM hilang dari Admin WAM, /wam tetap Pra WAM, dan notifikasi Main WAM hanya ke penguji yang dipilih namanya. Tim WAM tetap bisa membuka lewat tautan langsung.");
    if (!sure) return;
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<MainWamVisibility>(MAIN_WAM_VISIBILITY_API, { method: "PUT", body: JSON.stringify({ shown }) });
      setState(result.data!);
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  return <div className={css.wrap} aria-busy={busy}>
    {!state.migrated && <Notice tone="warning">Pengaturan ini menunggu migrasi <code>{MAIN_WAM_VISIBILITY_MIGRATION}</code>. Sampai itu, Main WAM tersembunyi.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    <p className={css.hint}>
      {state.shown
        ? "Main WAM tampil di Journey: menunya ada di Admin WAM, /wam membukanya sesuai mode acara (Pengaturan Main WAM), dan notifikasinya terkirim seperti biasa."
        : "Main WAM tersembunyi: tidak ada menu Main WAM di Admin WAM, /wam selalu membuka Pra WAM, dan notifikasi Main WAM (termasuk Kuis dimulai) hanya ke penguji yang dipilih namanya di Pengaturan Main WAM. Tim WAM membuka halamannya lewat tautan langsung, dengan aturan akses yang sama."}
    </p>
    <div className={css.badgeRow}>
      {state.shown ? <Pill tone="ok">Ditampilkan</Pill> : <Pill tone="warn">Tersembunyi</Pill>}
      {state.changedAt && <span className={css.hint}>Diubah {state.changedBy ?? "super admin"} · {when(state.changedAt)}</span>}
    </div>
    <div>
      {state.shown
        ? <ConsoleButton icon={<EyeOff size={16} aria-hidden />} disabled={busy || !state.migrated} onClick={() => void change(false)}>Sembunyikan lagi</ConsoleButton>
        : <ConsoleButton variant="primary" icon={<Eye size={16} aria-hidden />} disabled={busy || !state.migrated} onClick={() => void change(true)}>Tampilkan Main WAM</ConsoleButton>}
    </div>
  </div>;
}
