"use client";

import { useState } from "react";
import { Copy, Plug, RefreshCw } from "lucide-react";
import { MCP_KEY_API } from "@/lib/pra-wam/mcp";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import base from "./pra-wam.module.css";
import css from "./mcp-card.module.css";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const at = (iso: string) => `${when.format(new Date(iso))} WIB`;

export type McpCardCall = { title: string; ok: boolean; createdAt: string };

/**
 * Pengaturan → Asisten AI → Akses MCP (BOD and Admin WAM with access from an admin): the status, a new link shown once
 * (it replaces the old one), how to paste it in Claude or ChatGPT, and their own last calls.
 */
export function McpCard({ hasKey, lastUsedAt, calls }: { hasKey: boolean; lastUsedAt: string | null; calls: McpCardCall[] }) {
  const [made, setMade] = useState(hasKey);
  const [lastUsed, setLastUsed] = useState(lastUsedAt);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function create() {
    if (made && !(await confirm({
      title: "Buat tautan baru?",
      body: "Tautan lama langsung berhenti bekerja. Claude atau ChatGPT yang masih memakainya perlu diisi tautan baru.",
      confirmLabel: "Buat tautan baru",
    }))) return;
    setBusy(true); setError(null); setCopied(null);
    try {
      const { data } = await praWamRequest<{ url: string }>(MCP_KEY_API, { method: "POST" });
      setUrl(data.url); setMade(true); setLastUsed(null);
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied("Tautan disalin."); }
    catch { setCopied("Tautan tidak dapat disalin otomatis. Pilih teksnya lalu salin."); }
  }

  return <section id="mcp" className={css.card} aria-labelledby="mcp-judul">
    {confirmDialog}
    <div className={css.top}>
      <span className={base.tile} aria-hidden><Plug /></span>
      <div className={css.topText}>
        <h2 id="mcp-judul">Akses MCP</h2>
        <p>{made ? `Aktif · ${lastUsed ? `terakhir dipakai ${at(lastUsed)}` : "belum pernah dipakai"}` : "Aktif · belum ada tautan"}</p>
      </div>
      <span className={`${base.pill} ${base.pillSuccess}`}>Hanya baca</span>
    </div>
    <p className={css.lead}>Tanyakan data WAM lewat Claude atau ChatGPT. Jawabannya mengikuti hak aksesmu di aplikasi ini.</p>

    {url ? <div className={css.fresh}>
      <strong>Simpan tautan ini sekarang</strong>
      <p>Tautan hanya ditampilkan sekali dan menggantikan tautan lama. Anggap seperti password: jangan dibagikan.</p>
      <div className={css.linkRow}>
        <input className={css.link} readOnly value={url} aria-label="Tautan MCP" onFocus={event => event.currentTarget.select()} />
        <button type="button" className="button button--primary" onClick={() => void copy()}><Copy size={18} aria-hidden /> Salin</button>
      </div>
      {copied && <p className={css.status} role="status">{copied}</p>}
    </div> : null}

    <div className={css.actions}>
      <button type="button" className={`button ${made ? "button--secondary" : "button--primary"}`} disabled={busy} onClick={() => void create()}>
        <RefreshCw size={18} aria-hidden /> {busy ? "Membuat…" : made ? "Buat tautan baru" : "Buat tautan"}
      </button>
    </div>
    {error && <p className={css.error} role="alert">{error}</p>}

    <div className={css.steps}>
      <div className={css.step}>
        <h3>Claude</h3>
        <ol>
          <li>Buka Settings, lalu Connectors.</li>
          <li>Pilih Add custom connector.</li>
          <li>Beri nama &quot;WAM Werkudara&quot;, tempel tautan, lalu Add.</li>
        </ol>
      </div>
      <div className={css.step}>
        <h3>ChatGPT</h3>
        <ol>
          <li>Buka Settings, lalu Apps &amp; Connectors.</li>
          <li>Di Advanced, nyalakan Developer mode.</li>
          <li>Pilih Create, tempel tautan, Authentication: None.</li>
        </ol>
      </div>
    </div>

    <h3 className={css.callsTitle}>Panggilan terakhir</h3>
    {calls.length ? <ul className={css.calls}>{calls.map((call, index) => <li key={`${call.createdAt}-${index}`} className={css.call}>
      <span className={call.ok ? undefined : css.callFailed}>{call.title}{call.ok ? "" : " · gagal"}</span>
      <small>{at(call.createdAt)}</small>
    </li>)}</ul> : <p className={css.none}>Belum ada panggilan.</p>}
  </section>;
}
