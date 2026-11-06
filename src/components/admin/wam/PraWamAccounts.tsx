"use client";

import { useMemo, useState } from "react";
import { ChevronRight, UserPlus } from "lucide-react";
import { Notice } from "@/components/ui";
import { Avatar, CardGrid, ConsoleButton, FilterChips, Pill, PersonCard, RolePills, SectionToolbar, ViewToggle, useViewPreference } from "@/components/console";
import cs from "@/components/console/console.module.css";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import type { PraWamRole } from "@/lib/pra-wam/roles";
import { EMPLOYEES_ADMIN, praWamAccountsApi, praWamPath } from "@/lib/routes";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import { AccountDetail } from "./akun/AccountDetail";
import { AccountsHeader } from "./akun/AccountsHeader";
import { accountFilters, accountStatus, accountSummary, byName, lastLoginLabel, matchesFilter, matchesSearch, roleItems, summaryLine, type AccountFilter } from "./akun/account-view";
import css from "./akun/akun.module.css";

type Message = { tone: "success" | "error"; text: string; skipped?: string[] } | null;

export type PraWamAccountsProps = {
  initial: AccountRow[];
  migrated: boolean;
  passwordReady: boolean;
  /** Data karyawan is the super admin's: whether its link is offered. */
  superAdmin?: boolean;
  /** Per employee id: a photo address and a job title (accountExtras); initials and no job without. */
  photos?: Record<string, string>;
  jobs?: Record<string, string>;
  /** Employee ids with an open "Lupa password" request. */
  resetRequested?: readonly string[];
  /** Open reset requests, for the tab's badge. */
  waiting?: number | null;
};

/**
 * Admin WAM → Akun dan peran, tab Akun: everyone active in Data karyawan with an email gets an
 * account (shared first password), roles on top of peserta, the sign-in email, and password
 * resets. People show as cards (or a table, remembered on this device), with search and a role
 * filter; a card opens the person's detail, where every change is made.
 */
export function PraWamAccounts({ initial, migrated, passwordReady, superAdmin = false, photos = {}, jobs = {}, resetRequested = [], waiting = null }: PraWamAccountsProps) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccountFilter>("semua");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useViewPreference("admin-wam-akun");
  const [confirm, confirmDialog] = useConfirm();
  const requested = useMemo(() => new Set(resetRequested), [resetRequested]);

  const summary = accountSummary(rows);
  const sorted = useMemo(() => [...rows].sort(byName), [rows]);
  const searched = sorted.filter(row => matchesSearch(row, query));
  const shown = searched.filter(row => matchesFilter(row, filter));
  const open = openId ? rows.find(row => row.employeeId === openId) ?? null : null;
  /** A fresh detail: the last change's message belongs to someone else. */
  const openDetail = (id: string) => { setMessage(null); setRowError(null); setOpenId(id); };

  /** `rowId`: a change to one person, whose error shows in their detail rather than at the top. */
  async function run(key: string, url: string, body: unknown, method: "POST" | "PATCH", rowId?: string): Promise<boolean> {
    setBusy(key); setMessage(null); setRowError(null);
    try {
      const result = await adminRequest<{ rows: AccountRow[]; skipped?: string[] }>(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (result.data) setRows(result.data.rows);
      setMessage({ tone: "success", text: result.message, skipped: result.data?.skipped });
      return true;
    } catch (error) {
      if (rowId) setRowError({ id: rowId, text: errorMessage(error) });
      else setMessage({ tone: "error", text: errorMessage(error) });
      return false;
    }
    finally { setBusy(null); }
  }
  const toggleRole = (row: AccountRow, role: PraWamRole) =>
    run(`role-${row.employeeId}`, praWamAccountsApi(row.employeeId), { roles: row.roles.includes(role) ? row.roles.filter(item => item !== role) : [...row.roles, role] }, "PATCH", row.employeeId);
  const saveEmail = (row: AccountRow, email: string) => run(`email-${row.employeeId}`, praWamAccountsApi(row.employeeId), { email }, "PATCH", row.employeeId);
  const createOne = (row: AccountRow) => run(`create-${row.employeeId}`, praWamAccountsApi(row.employeeId), null, "POST", row.employeeId);
  const reset = async (row: AccountRow) => {
    if (!(await confirm({
      title: "Atur ulang password?",
      body: `Password ${row.name} kembali ke password awal. Ia keluar dari semua perangkat dan diminta membuat password baru saat masuk.`,
      confirmLabel: "Atur ulang",
      danger: true,
    }))) return;
    void run(`reset-${row.employeeId}`, praWamAccountsApi(row.employeeId), { resetPassword: true }, "PATCH", row.employeeId);
  };

  if (!migrated) return <>
    <AccountsHeader tab="akun" waiting={waiting} />
    <Notice tone="warning">Akun Pra WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>
  </>;

  const createLabel = busy === "create" ? "Membuat akun…" : summary.creatable ? `Buat ${summary.creatable} akun` : "Buat akun";
  const chips = accountFilters.map(chip => ({ ...chip, count: searched.filter(row => matchesFilter(row, chip.value)).length }));
  const status = (row: AccountRow) => accountStatus(row, requested);
  const label = (row: AccountRow) => `${row.name}${row.active ? "" : " (nonaktif)"}`;

  return <>
    {confirmDialog}
    <AccountsHeader tab="akun" waiting={waiting} subtitle={summaryLine(summary)}
      actions={<ConsoleButton variant="primary" icon={<UserPlus size={18} aria-hidden />} disabled={!!busy || !passwordReady || summary.creatable === 0}
        title={summary.creatable === 0 ? "Semua karyawan aktif yang punya email sudah punya akun." : undefined}
        onClick={() => run("create", praWamAccountsApi(), null, "POST")}>{createLabel}</ConsoleButton>} />

    {!passwordReady && <Notice tone="warning">Password awal belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server, lalu muat ulang halaman ini.</Notice>}
    {summary.missingEmail > 0 && <Notice tone="info">{summary.missingEmail} orang belum punya email. Isi emailnya lewat detail orangnya (filter Semua, status Belum ada akun){superAdmin ? <>, atau di <a href={EMPLOYEES_ADMIN}>Data karyawan</a> (impor ulang Excel dengan kolom EMAIL)</> : ""}.</Notice>}
    {message && <Notice tone={message.tone}>{message.text}{message.skipped?.length ? <ul>{message.skipped.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}

    <section className={css.section} aria-labelledby="semua-akun">
      <SectionToolbar title={<span id="semua-akun">Semua akun</span>} count={`${shown.length} orang`}
        search={{ label: "Cari nama, departemen, atau email", placeholder: "Cari nama, departemen, email", value: query, onChange: setQuery }}
        view={<ViewToggle value={view} onChange={setView} />} />
      <FilterChips label="Saring peran dan status" chips={chips} value={filter} onChange={setFilter} />
      <p className={css.lead}>{summary.withAccount} dari {summary.active} karyawan aktif sudah punya akun. Mereka masuk di <a href={praWamPath.login()}>{praWamPath.login()}</a> dengan email kantor dan password awal yang sama, lalu bisa menggantinya di Profil → Pengaturan.</p>

      {shown.length === 0 ? <p className={css.empty}>Tidak ada orang yang cocok. Ganti kata cari atau saringannya.</p>
        : view === "kartu"
          ? <CardGrid label="Akun">{shown.map(row => <PersonCard key={row.employeeId} name={label(row)} job={jobs[row.employeeId]} photo={photos[row.employeeId]}
              status={status(row)} unit={row.department} roles={roleItems(row)} email={row.email || "Belum ada email"}
              meta={`Terakhir masuk: ${lastLoginLabel(row)}`} onClick={() => openDetail(row.employeeId)} />)}</CardGrid>
          : <div className={cs.tableWrap}>
              <table className={cs.table}>
                <caption className="sr-only">Akun, urut nama</caption>
                <thead><tr><th scope="col">Nama</th><th scope="col">Departemen</th><th scope="col">Peran</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Terakhir masuk</th><th scope="col"><span className="sr-only">Buka</span></th></tr></thead>
                <tbody>{shown.map(row => {
                  const state = status(row);
                  return <tr key={row.employeeId}>
                    <td><span className={css.nameCell}><Avatar name={row.name} photo={photos[row.employeeId]} size={36} />
                      <span className={css.nameText}><strong>{label(row)}</strong>{jobs[row.employeeId] && <small>{jobs[row.employeeId]}</small>}</span></span></td>
                    <td className={cs.tableMuted}>{row.department || "—"}</td>
                    <td><RolePills roles={roleItems(row)} max={1} /></td>
                    <td className={css.emailCell}>{row.email || "—"}</td>
                    <td><Pill tone={state.tone}>{state.label}</Pill></td>
                    <td className={cs.tableMuted}>{lastLoginLabel(row)}</td>
                    <td><button type="button" className={css.openButton} aria-label={`Buka akun ${row.name}`} onClick={() => openDetail(row.employeeId)}><ChevronRight size={18} aria-hidden /></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
    </section>

    {open && <AccountDetail key={open.employeeId} row={open} status={status(open)} photo={photos[open.employeeId]} job={jobs[open.employeeId]}
      busy={busy} passwordReady={passwordReady} error={rowError?.id === open.employeeId ? rowError.text : undefined}
      done={message?.tone === "success" ? message.text : undefined}
      onClose={() => { setOpenId(null); setRowError(null); }}
      onToggleRole={role => void toggleRole(open, role)} onSaveEmail={email => saveEmail(open, email)}
      onReset={() => void reset(open)} onCreate={() => void createOne(open)} />}
  </>;
}
