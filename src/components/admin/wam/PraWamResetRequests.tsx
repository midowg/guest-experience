"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Notice } from "@/components/ui";
import { Avatar, ConsoleButton, Pill, SectionToolbar } from "@/components/console";
import cs from "@/components/console/console.module.css";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { resetStatusLabels } from "@/lib/pra-wam/reset-requests";
import { praWamResetRequestsApi } from "@/lib/routes";
import type { ResetRequestList, ResetRequestRow } from "@/lib/server/pra-wam/reset-requests";
import { AccountsHeader } from "./akun/AccountsHeader";
import { shortDateTime } from "./akun/account-view";
import css from "./akun/akun.module.css";

const who = (row: ResetRequestRow) => row.name ?? "Email tidak terdaftar";
const DAY_MS = 86_400_000;

/** Why "Reset password" cannot be used for a request, or null when it can. */
export function resetBlocked(row: ResetRequestRow, passwordReady: boolean): string | null {
  if (!row.employeeId) return "Email ini tidak ada di Data karyawan. Periksa ejaannya, atau tolak.";
  if (!row.hasAccount) return "Orang ini belum punya akun Pra WAM. Buat akunnya dulu di Akun dan peran.";
  if (!passwordReady) return "Password awal belum disiapkan di server.";
  return null;
}

/** `known` with `fresh` laid over it (by id), handled within `days` days of `now`, newest first. */
export function mergeHistory(known: readonly ResetRequestRow[], fresh: readonly ResetRequestRow[], days: number, now = Date.now()): ResetRequestRow[] {
  const byId = new Map(known.map(row => [row.id, row]));
  for (const row of fresh) byId.set(row.id, row);
  const since = now - days * DAY_MS;
  return [...byId.values()].filter(row => row.handledAt && Date.parse(row.handledAt) >= since)
    .sort((a, b) => (b.handledAt ?? "").localeCompare(a.handledAt ?? ""));
}

/**
 * Admin WAM → Akun dan peran, tab Permintaan reset: "Lupa password" requests from
 * /wam/forgot-password as cards. An admin resets the account to the shared first password (through
 * the same reset as Akun dan peran) or declines; below, what was handled in the last `days` days.
 */
export function PraWamResetRequests({ initial, passwordReady, recent, days = 30, photos = {}, subtitle }: {
  initial: ResetRequestList; passwordReady: boolean;
  /** Handled in the last `days` days; without it, the list's own short history. */
  recent?: ResetRequestRow[]; days?: number;
  photos?: Record<string, string>;
  /** The header's account counts. */
  subtitle?: string;
}) {
  const [list, setList] = useState(initial);
  const [history, setHistory] = useState(() => mergeHistory(recent ?? [], initial.history, days));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const show = (fresh: ResetRequestList | undefined) => {
    if (!fresh) return;
    setList(fresh);
    setHistory(known => mergeHistory(known, fresh.history, days));
  };
  async function refresh() {
    setBusy("refresh"); setMessage(null); setRowError(null);
    try { show((await adminRequest<ResetRequestList>(praWamResetRequestsApi())).data); }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  async function answer(row: ResetRequestRow, action: "reset" | "tolak") {
    if (action === "reset" && !(await confirm({
      title: "Atur ulang password?",
      body: `Password ${who(row)} (${row.email}) kembali ke password awal. Ia keluar dari semua perangkat dan diminta membuat password baru saat masuk.`,
      confirmLabel: "Atur ulang",
      danger: true,
    }))) return;
    setBusy(`${action}-${row.id}`); setMessage(null); setRowError(null);
    try {
      const result = await adminRequest<ResetRequestList>(praWamResetRequestsApi(row.id), { method: "PATCH", body: JSON.stringify({ action }) });
      show(result.data);
      setMessage({ tone: "success", text: `${who(row)}: ${result.message}` });
    } catch (error) {
      setRowError({ id: row.id, text: errorMessage(error) });
      // The request may have been handled elsewhere meanwhile; show the list as it is now.
      try { show((await adminRequest<ResetRequestList>(praWamResetRequestsApi())).data); } catch { /* keep the list shown */ }
    } finally { setBusy(null); }
  }

  const count = list.open.length;
  return <>
    {confirmDialog}
    <AccountsHeader tab="reset" waiting={list.migrated ? count : null} subtitle={subtitle}
      actions={list.migrated ? <ConsoleButton icon={<RefreshCw size={18} aria-hidden />} disabled={!!busy} onClick={refresh}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</ConsoleButton> : undefined} />
    {!list.migrated ? <Notice tone="warning">Permintaan reset password menunggu migrasi 202611040010_pra_wam_photos_reset_requests.sql. Sampai itu diterapkan, orang yang lupa password diminta menghubungi admin langsung.</Notice> : <>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section className={css.section} aria-labelledby="permintaan-reset">
        <SectionToolbar title={<span id="permintaan-reset">Menunggu jawaban</span>} count={`${count} permintaan`} />
        <p className={css.lead}>Dari halaman Lupa password. Reset mengembalikan password ke password awal; orangnya keluar dari semua perangkat lalu membuat password baru saat masuk. Isi email tidak pernah memberi tahu peminta apakah emailnya terdaftar.</p>
        {count === 0 ? <p className={css.empty}>Tidak ada permintaan yang menunggu.</p>
          : <ul className={css.requests} aria-label="Permintaan reset yang menunggu, terbaru di atas">{list.open.map(row => {
            const blocked = resetBlocked(row, passwordReady);
            const hintId = `reset-${row.id}`;
            return <li key={row.id} className={css.request}>
              <Avatar name={who(row)} photo={row.employeeId ? photos[row.employeeId] : undefined} />
              <div className={css.requestMain}>
                <div className={css.requestTop}>
                  <strong>{row.name ?? <em>Email tidak terdaftar</em>}</strong>
                  <Pill tone="warn">Menunggu</Pill>
                </div>
                <p className={css.requestMeta}>{row.email} · diminta {shortDateTime(row.createdAt)}{row.department ? ` · ${row.department}` : ""}</p>
                {row.note && <p className={css.requestNote}>{row.note}</p>}
                {blocked && <p id={hintId} className={css.hint}>{blocked}</p>}
                {rowError?.id === row.id && <p role="alert" className={css.error}>{rowError.text}</p>}
              </div>
              <div className={css.requestActions}>
                <ConsoleButton disabled={!!busy} onClick={() => answer(row, "tolak")}>{busy === `tolak-${row.id}` ? "Menolak…" : "Tolak"}</ConsoleButton>
                <ConsoleButton variant="primary" disabled={!!busy || !!blocked} aria-describedby={blocked ? hintId : undefined} onClick={() => answer(row, "reset")}>{busy === `reset-${row.id}` ? "Mengatur…" : "Reset password"}</ConsoleButton>
              </div>
            </li>;
          })}</ul>}
      </section>

      <section className={css.section} aria-labelledby="reset-selesai">
        <SectionToolbar title={<span id="reset-selesai">Selesai {days} hari terakhir</span>} count={`${history.length} permintaan`} />
        {history.length === 0 ? <p className={css.empty}>Belum ada permintaan yang ditangani dalam {days} hari terakhir.</p>
          : <div className={cs.tableWrap}>
            <table className={cs.table}>
              <caption className="sr-only">Permintaan yang sudah ditangani, terbaru di atas</caption>
              <thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Hasil</th><th scope="col">Ditangani</th></tr></thead>
              <tbody>{history.map(row => <tr key={row.id}>
                <td>{row.name ?? <em>Email tidak terdaftar</em>}</td>
                <td className={cs.tableMuted}>{row.email}</td>
                <td><Pill tone={row.status === "selesai" ? "ok" : "neutral"}>{resetStatusLabels[row.status]}</Pill></td>
                <td className={cs.tableMuted}>{row.handledAt ? shortDateTime(row.handledAt) : "—"}{row.handledBy ? ` · ${row.handledBy}` : ""}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
    </>}
  </>;
}
