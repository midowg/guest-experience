"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { MAIN_WAM_VISIBILITY_MIGRATION, type MainWamVisibility } from "@/lib/main-wam-visibility";
import { MAIN_WAM_VISIBILITY_API } from "@/lib/routes";
import css from "./home-style.module.css";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Super admin → Halaman utama → Main WAM (20 Nov 2026, keputusan pemilik): Main WAM (the app during WAM
 * itself, Kuis live included) stays out of sight in the app until it is shown here. Only the super admin
 * sees this switch; it is recorded with who and when. Since the two doors (20 Nov 2026, KONTRAK §15) it is
 * the app's only: where /wam goes and who gets Main WAM's notes. Admin WAM 2026 is never hidden by it, and
 * Admin Pra WAM never has Main WAM.
 */
export function MainWamVisibilitySettings({ initial }: { initial: MainWamVisibility }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function change(shown: boolean) {
    const sure = shown
      ? window.confirm("Tampilkan WAM 2026 di aplikasi? /wam membuka WAM 2026 sesuai mode acaranya, dan notifikasinya terkirim ke semua yang bisa membukanya.")
      : window.confirm(`Sembunyikan WAM 2026 lagi? /wam tetap Pra WAM, dan notifikasinya hanya ke penguji dan Panitia WAM. Penguji tetap bisa membuka lewat tautan langsung, dan ${WAM_EVENT_ADMIN_LABEL} tetap terbuka.`);
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
    {!state.migrated && <Notice tone="warning">Pengaturan ini menunggu migrasi <code>{MAIN_WAM_VISIBILITY_MIGRATION}</code>. Sampai itu, WAM 2026 tersembunyi.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    <p className={css.hint}>
      {state.shown
        ? `WAM 2026 tampil di aplikasi: /wam membukanya sesuai mode acara (${WAM_EVENT_ADMIN_LABEL} → Pengaturan), dan notifikasinya terkirim seperti biasa.`
        : `WAM 2026 tersembunyi di aplikasi: /wam selalu membuka Pra WAM, dan notifikasinya (termasuk Kuis dimulai) hanya ke penguji dan Panitia WAM. Penguji membukanya lewat tautan langsung, dengan aturan akses yang sama. Ini hanya untuk sisi aplikasi: ${WAM_EVENT_ADMIN_LABEL} tetap terbuka untuk pemegang aksesnya.`}
    </p>
    <div className={css.badgeRow}>
      {state.shown ? <Pill tone="ok">Ditampilkan</Pill> : <Pill tone="warn">Tersembunyi</Pill>}
      {state.changedAt && <span className={css.hint}>Diubah {state.changedBy ?? "super admin"} · {when(state.changedAt)}</span>}
    </div>
    <div>
      {state.shown
        ? <ConsoleButton icon={<EyeOff size={16} aria-hidden />} disabled={busy || !state.migrated} onClick={() => void change(false)}>Sembunyikan lagi</ConsoleButton>
        : <ConsoleButton variant="primary" icon={<Eye size={16} aria-hidden />} disabled={busy || !state.migrated} onClick={() => void change(true)}>Tampilkan WAM 2026</ConsoleButton>}
    </div>
  </div>;
}
