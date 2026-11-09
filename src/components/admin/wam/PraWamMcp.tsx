"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, PageHeader, Pill, SectionToolbar, type Crumb } from "@/components/console";
import cs from "@/components/console/console.module.css";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { DEFAULT_MCP_SCOPES, MCP_SCOPES, mcpAdminApi, mcpScopeLabels, normalizeScopes, toolTitle, type McpScope } from "@/lib/pra-wam/mcp";
import type { McpAccessRow, McpAdminList } from "@/lib/server/pra-wam/mcp";
import { shortDateTime } from "./akun/account-view";
import akun from "./akun/akun.module.css";
import css from "./mcp.module.css";

const MIGRATION = "202611060010_pra_wam_mcp.sql";

/** The scope checkboxes, shared by the add form and a row's "Ubah cakupan". */
function ScopeChecks({ legend, value, onChange, disabled, idPrefix }: { legend: string; value: McpScope[]; onChange: (next: McpScope[]) => void; disabled: boolean; idPrefix: string }) {
  return <fieldset className={css.scopes} disabled={disabled}>
    <legend>{legend}</legend>
    {MCP_SCOPES.map(scope => {
      const id = `${idPrefix}-${scope}`;
      return <label key={scope} className={css.scope} htmlFor={id}>
        <input id={id} type="checkbox" checked={value.includes(scope)}
          onChange={change => onChange(normalizeScopes(change.target.checked ? [...value, scope] : value.filter(item => item !== scope)))} />
        <span><strong>{mcpScopeLabels[scope].label}</strong><small>{mcpScopeLabels[scope].hint}</small></span>
      </label>;
    })}
  </fieldset>;
}

function keyLabel(row: McpAccessRow): string {
  if (row.revokedAt) return "Tautan dihapus saat dicabut";
  if (!row.hasKey) return "Belum membuat tautan";
  return `Tautan berakhiran …${row.keyHint ?? ""}${row.keyCreatedAt ? `, dibuat ${shortDateTime(row.keyCreatedAt)}` : ""}`;
}

/**
 * Admin WAM → Akses MCP: who may connect Claude or ChatGPT to WAM (read only, as themselves),
 * what they may ask about, and the last calls. The person makes their own link in Pengaturan WAM (Akses MCP, BOD only);
 * Cabut stops it at once and forgets the link.
 */
export function PraWamMcp({ initial, crumbs, title }: { initial: McpAdminList; crumbs: readonly Crumb[]; title: string }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pick, setPick] = useState("");
  const [scopes, setScopes] = useState<McpScope[]>([...DEFAULT_MCP_SCOPES]);
  const [editing, setEditing] = useState<{ id: string; scopes: McpScope[] } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function run(tag: string, url: string, init: RequestInit, after?: () => void) {
    setBusy(tag); setMessage(null);
    try {
      const result = await adminRequest<McpAdminList>(url, init);
      if (result.data) setList(result.data);
      setMessage({ tone: "success", text: result.message });
      after?.();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  const refresh = () => run("refresh", mcpAdminApi(), {}, () => setMessage(null));
  const grant = () => run("grant", mcpAdminApi(), { method: "POST", body: JSON.stringify({ employeeId: pick, scopes }) }, () => { setPick(""); setScopes([...DEFAULT_MCP_SCOPES]); });
  async function revoke(row: McpAccessRow) {
    if (!(await confirm({
      title: "Cabut akses MCP?",
      body: `${row.name} tidak bisa lagi memakai Claude atau ChatGPT untuk data WAM. Tautannya langsung tidak berlaku; kalau dipulihkan, ia membuat tautan baru.`,
      confirmLabel: "Cabut", danger: true,
    }))) return;
    await run(`cabut-${row.employeeId}`, mcpAdminApi(row.employeeId), { method: "PATCH", body: JSON.stringify({ action: "cabut" }) });
  }
  const restore = (row: McpAccessRow) => run(`pulihkan-${row.employeeId}`, mcpAdminApi(row.employeeId), { method: "PATCH", body: JSON.stringify({ action: "pulihkan" }) });
  const saveScopes = (row: McpAccessRow, next: McpScope[]) => run(`cakupan-${row.employeeId}`, mcpAdminApi(row.employeeId), { method: "PATCH", body: JSON.stringify({ scopes: next }) }, () => setEditing(null));

  const active = list.rows.filter(row => !row.revokedAt).length;
  return <>
    {confirmDialog}
    <PageHeader crumbs={crumbs} title={title}
      subtitle="Hubungkan Claude atau ChatGPT ke data WAM, hanya baca. Jawaban mengikuti hak akses orangnya sendiri."
      actions={list.migrated ? <ConsoleButton icon={<RefreshCw size={18} aria-hidden />} disabled={!!busy} onClick={() => void refresh()}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</ConsoleButton> : undefined} />
    {!list.migrated ? <Notice tone="warning">Akses MCP menunggu migrasi {MIGRATION}. Jalankan di Supabase SQL Editor; sampai itu, semua tautan MCP ditolak.</Notice> : <>
      <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>

      <section className={akun.section} aria-labelledby="mcp-akses">
        <SectionToolbar title={<span id="mcp-akses">Punya akses</span>} count={`${active} aktif`} />
        <p className={akun.lead}>Hanya untuk BOD. BOD-nya membuat tautan sendiri di Pengaturan WAM → Akses MCP, lalu menempelkannya di Claude atau ChatGPT. Tautan itu rahasia; Cabut menghentikannya saat itu juga.</p>
        {list.rows.length === 0 ? <p className={akun.empty}>Belum ada yang diberi akses MCP.</p>
          : <ul className={css.rows} aria-label="Orang dengan akses MCP">{list.rows.map(row => {
            const revoked = !!row.revokedAt;
            const edit = editing?.id === row.employeeId ? editing : null;
            return <li key={row.employeeId} className={`${css.row} ${revoked ? css.revoked : ""}`}>
              <div className={css.rowTop}>
                <span className={css.rowName}><strong>{row.name}</strong>{row.department && <small>{row.department}</small>}</span>
                <span className={css.pills}>
                  <Pill tone={revoked ? "neutral" : "ok"}>{revoked ? "Dicabut" : "Aktif"}</Pill>
                  {!revoked && <Pill tone={row.hasKey ? "blue" : "warn"}>{row.hasKey ? "Tautan dibuat" : "Belum ada tautan"}</Pill>}
                </span>
              </div>
              {edit
                ? <ScopeChecks legend="Cakupan" idPrefix={`cakupan-${row.employeeId}`} value={edit.scopes} disabled={!!busy} onChange={next => setEditing({ id: row.employeeId, scopes: next })} />
                : <p className={css.meta}>Cakupan: {row.scopes.map(scope => mcpScopeLabels[scope].label).join(", ") || "tidak ada"}</p>}
              <p className={css.meta}>
                {keyLabel(row)} · {row.lastUsedAt ? `terakhir dipakai ${shortDateTime(row.lastUsedAt)}` : "belum pernah dipakai"}
                {" · "}{revoked ? `dicabut ${shortDateTime(row.revokedAt!)}` : `dibuka ${shortDateTime(row.grantedAt)}${row.grantedBy ? ` oleh ${row.grantedBy}` : ""}`}
              </p>
              <div className={css.rowActions}>
                {edit ? <>
                  <ConsoleButton disabled={!!busy} onClick={() => setEditing(null)}>Batal</ConsoleButton>
                  <ConsoleButton variant="primary" disabled={!!busy || !edit.scopes.length} onClick={() => void saveScopes(row, edit.scopes)}>{busy === `cakupan-${row.employeeId}` ? "Menyimpan…" : "Simpan cakupan"}</ConsoleButton>
                </> : <>
                  {!revoked && <ConsoleButton disabled={!!busy} onClick={() => setEditing({ id: row.employeeId, scopes: row.scopes })}>Ubah cakupan</ConsoleButton>}
                  {revoked
                    ? <ConsoleButton variant="primary" disabled={!!busy} onClick={() => void restore(row)}>{busy === `pulihkan-${row.employeeId}` ? "Memulihkan…" : "Pulihkan"}</ConsoleButton>
                    : <ConsoleButton disabled={!!busy} onClick={() => void revoke(row)}>{busy === `cabut-${row.employeeId}` ? "Mencabut…" : "Cabut"}</ConsoleButton>}
                </>}
              </div>
            </li>;
          })}</ul>}
      </section>

      <section className={akun.section} aria-labelledby="mcp-tambah">
        <SectionToolbar title={<span id="mcp-tambah">Tambah orang</span>} />
        <form className={css.form} onSubmit={event => { event.preventDefault(); void grant(); }}>
          <div className="field">
            <label htmlFor="mcp-orang">Akun WAM</label>
            <select id="mcp-orang" className="select" value={pick} disabled={!!busy || !list.candidates.length} onChange={change => setPick(change.target.value)}>
              <option value="">{list.candidates.length ? "Pilih orang" : "Semua akun WAM aktif sudah tercantum"}</option>
              {list.candidates.map(person => <option key={person.employeeId} value={person.employeeId}>{person.name}{person.department ? ` · ${person.department}` : ""}</option>)}
            </select>
          </div>
          <ScopeChecks legend="Boleh bertanya tentang" idPrefix="tambah" value={scopes} disabled={!!busy} onChange={setScopes} />
          <p className={akun.hint}>Profil peserta tidak tercentang dulu: buka hanya untuk yang memang perlu melihat data per orang.</p>
          <div className={css.actions}>
            <ConsoleButton type="submit" variant="primary" disabled={!!busy || !pick || !scopes.length}>{busy === "grant" ? "Membuka…" : "Buka akses"}</ConsoleButton>
          </div>
        </form>
      </section>

      <section className={akun.section} aria-labelledby="mcp-log">
        <SectionToolbar title={<span id="mcp-log">Panggilan terakhir</span>} count={`${list.recent.length} panggilan`} />
        {list.recent.length === 0 ? <p className={akun.empty}>Belum ada panggilan.</p>
          : <div className={cs.tableWrap}>
            <table className={cs.table}>
              <caption className="sr-only">30 panggilan MCP terakhir, terbaru di atas</caption>
              <thead><tr><th scope="col">Siapa</th><th scope="col">Data</th><th scope="col">Hasil</th><th scope="col">Waktu</th></tr></thead>
              <tbody>{list.recent.map(call => <tr key={call.id}>
                <td>{call.name}</td>
                <td>{toolTitle(call.tool)}</td>
                <td><Pill tone={call.ok ? "ok" : "bad"}>{call.ok ? "Berhasil" : "Gagal"}</Pill></td>
                <td className={cs.tableMuted}>{shortDateTime(call.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
    </>}
  </>;
}
