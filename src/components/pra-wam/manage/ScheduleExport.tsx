"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileSpreadsheet, FileText, MessageCircle, Table2, X } from "lucide-react";
import { ConsoleButton, ConsoleButtonLink } from "@/components/console";
import { Notice } from "@/components/ui";
import { praWamApi } from "@/lib/routes";
import styles from "../panitia.module.css";

/**
 * Linimasa's "Export" (10 Nov 2026): the week or day on screen as PDF or Excel, or as a text to
 * paste into WhatsApp (copy, or open WhatsApp with it). The text is made when the dialog opens and
 * can be changed before it is sent, for a mention or a note.
 */
export function ScheduleExport({ range, date, label }: { range: "minggu" | "hari"; date: string; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [copied, setCopied] = useState(false);
  // Data lengkap (13 Nov 2026): every meeting between two dates; either left empty is open.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const backwards = !!from && !!to && from > to;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal?.();
    if (!open && element.open) { element.close(); opener.current?.focus(); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    /* eslint-disable react-hooks/set-state-in-effect -- a new text is asked for each time it opens */
    setState("loading"); setCopied(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(praWamApi.sessionsExport("text", range, date), { cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.text(); })
      .then(body => { if (live) { setText(body); setState("idle"); } })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [open, range, date]);

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }

  const unit = range === "minggu" ? "minggu" : "hari";
  return <>
    <ConsoleButton icon={<Download size={18} aria-hidden />} aria-haspopup="dialog" onClick={event => { opener.current = event.currentTarget; setOpen(true); }}>Export</ConsoleButton>
    <dialog ref={dialog} className={styles.compose} aria-labelledby="export-jadwal"
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === dialog.current) setOpen(false); }}>
      {open && <div className={styles.composeBody}>
        <div className={styles.composeHead}>
          <div>
            <h2 id="export-jadwal">Export jadwal</h2>
            <p className={styles.hint}>Sesi terbit {unit} ini · {label}</p>
          </div>
          <button type="button" className={styles.composeClose} aria-label="Tutup" onClick={() => setOpen(false)}><X size={22} aria-hidden /></button>
        </div>
        <div className={styles.exportFiles}>
          <ConsoleButtonLink href={praWamApi.sessionsExport("pdf", range, date)} download icon={<FileText size={18} aria-hidden />}>PDF</ConsoleButtonLink>
          <ConsoleButtonLink href={praWamApi.sessionsExport("xlsx", range, date)} download icon={<FileSpreadsheet size={18} aria-hidden />}>Excel</ConsoleButtonLink>
        </div>
        <fieldset className={styles.exportFull}>
          <legend>Data lengkap semua meeting</legend>
          <p className={styles.hint}>Excel berisi semua meeting terbit: tanggal, jam, ruang, nama lengkap peserta, dan Dept x Dept. Kosongkan tanggal untuk semua jadwal.</p>
          <div className={styles.exportRange}>
            <label className={styles.field}><span>Dari</span><input className={styles.fieldInput} type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
            <label className={styles.field}><span>Sampai</span><input className={styles.fieldInput} type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
          </div>
          {backwards && <p className={styles.hint} role="alert">Tanggal &ldquo;Dari&rdquo; harus sebelum &ldquo;Sampai&rdquo;.</p>}
          <ConsoleButtonLink href={praWamApi.sessionsFullExport(from, to)} download aria-disabled={backwards || undefined}
            onClick={event => { if (backwards) event.preventDefault(); }} icon={<Table2 size={18} aria-hidden />}>Unduh data lengkap (Excel)</ConsoleButtonLink>
        </fieldset>
        <div className={styles.field}>
          <label htmlFor="export-text">Teks untuk WhatsApp</label>
          {state === "error" ? <Notice tone="error">Teks belum bisa dibuat. Tutup lalu coba lagi.</Notice>
            : <textarea id="export-text" className={`${styles.fieldInput} ${styles.exportText}`} rows={12} value={state === "loading" ? "Menyusun teks…" : text}
              readOnly={state === "loading"} onChange={event => { setText(event.target.value); setCopied(false); }} />}
          <p className={styles.hint}>Bisa diubah dulu, misalnya menambah mention. *Teks bertanda bintang* tampil tebal di WhatsApp.</p>
        </div>
        <div className={styles.composeActions}>
          <span role="status" className={styles.hint}>{copied ? "Teks disalin." : ""}</span>
          <ConsoleButton disabled={state !== "idle" || !text} icon={<Copy size={18} aria-hidden />} onClick={copy}>Salin</ConsoleButton>
          <ConsoleButtonLink variant="primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
            aria-disabled={state !== "idle" || !text} onClick={event => { if (state !== "idle" || !text) event.preventDefault(); }} icon={<MessageCircle size={18} aria-hidden />}>Kirim ke WhatsApp</ConsoleButtonLink>
        </div>
      </div>}
    </dialog>
  </>;
}
