"use client";

import { useState } from "react";
import { CalendarDays, CalendarRange, Check, CircleX, Download, History, Infinity as AllTime, Sheet as SheetIcon } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { useToast } from "@/components/app-shell/Toast";
import { monthRange, previousMonth, wibToday } from "@/lib/wellbeing/rules";
import { errorText, type MyExport } from "./api";
import { useWellbeing } from "./context";
import { formatDate } from "./format";
import { cx } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Unduh rekap saya (19 Nov 2026, from Profil): my own WLM data as an Excel file, to keep my own recap.
 * Pick the period (this month, last month, all of it, or dates), then Unduh Excel. On a phone that can
 * share files the file goes to the share sheet (Simpan ke File, WhatsApp, Drive); otherwise it downloads.
 * Three sheets: Ringkasan (points per dimension), Aktivitas, Poin dari admin.
 */

type Period = MyExport["period"];
const monthName = (date: string) => formatDate(date, { month: "long", year: "numeric" });

/** Hands the file over: the share sheet where a phone has one for files, else a download. */
async function handOver(blob: Blob, name: string): Promise<"shared" | "downloaded"> {
  const file = typeof File === "function" ? new File([blob], name, { type: blob.type }) : null;
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return "shared"; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "shared"; /* not allowed here: download instead */ }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useWellbeing();
  const toast = useToast();
  const today = wibToday();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(monthRange(today).from);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const options: { value: Period; label: string; meta: string; icon: typeof CalendarDays }[] = [
    { value: "month", label: "Bulan ini", meta: monthName(today), icon: CalendarDays },
    { value: "last_month", label: "Bulan lalu", meta: monthName(previousMonth(today).from), icon: History },
    { value: "all", label: "Sepanjang program", meta: "Semua sejak mulai", icon: AllTime },
    { value: "range", label: "Pilih tanggal", meta: "Tentukan rentangnya", icon: CalendarRange },
  ];

  async function download() {
    setProblem(null);
    if (period === "range" && (!from || !to)) return setProblem("Isi tanggal mulai dan akhir.");
    if (period === "range" && from > to) return setProblem("Tanggal akhir sebelum tanggal mulai.");
    setBusy(true);
    try {
      const { blob, name } = await api.exportMine({ period, ...(period === "range" ? { from, to } : {}) });
      const how = await handOver(blob, name);
      toast({ message: how === "downloaded" ? `Rekap diunduh: ${name}` : "Rekap siap dibagikan.", tone: "ok" });
      onClose();
    } catch (error) { setProblem(errorText(error)); }
    finally { setBusy(false); }
  }

  return <Panel open={open} onClose={onClose} title="Unduh rekap saya" variant="sheet" locked={busy}
    footer={<button type="button" className={cx(css.btn, css.btnPrimary, css.block)} onClick={() => void download()} aria-busy={busy} disabled={busy}>
      {busy ? <span className={css.spin} aria-hidden="true" /> : <Download size={20} aria-hidden="true" />}{busy ? "Menyiapkan…" : "Unduh Excel"}</button>}>
    <p className={css.muted}>Data WLM milikmu sendiri dalam satu file Excel: ringkasan poin per dimensi, semua aktivitas dengan statusnya, dan poin dari admin. Bisa dibuka di Excel atau Google Sheets.</p>
    <div className={cx(css.card, css.list)} role="radiogroup" aria-label="Periode" style={{ marginTop: 16 }}>
      {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={period === option.value} className={cx(css.row, css.pressable)}
        onClick={() => { setPeriod(option.value); setProblem(null); }}>
        <span className={cx(css.lead, css.tonePrimary)}><option.icon size={22} aria-hidden="true" /></span>
        <span className={css.rowMain}><span className={css.rowTitle}>{option.label}</span><span className={css.rowMeta}>{option.meta}</span></span>
        <span className={css.radioMark} aria-hidden="true">{period === option.value && <Check size={18} strokeWidth={3} />}</span>
      </button>)}
    </div>
    {period === "range" && <div className={css.grid2} style={{ marginTop: 16 }}>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="export-from">Dari</label>
        <input id="export-from" className={css.input} type="date" value={from} max={to || today} onChange={event => setFrom(event.target.value)} />
      </div>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor="export-to">Sampai</label>
        <input id="export-to" className={css.input} type="date" value={to} min={from || undefined} max={today} onChange={event => setTo(event.target.value)} />
      </div>
    </div>}
    <p className={cx(css.caption, css.faint)} style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center" }}><SheetIcon size={14} aria-hidden="true" />Isinya hanya datamu; data karyawan lain tidak ikut.</p>
    {problem && <p className={cx(css.note, css.noteErr)} role="alert"><CircleX size={20} aria-hidden="true" /><span>{problem}</span></p>}
  </Panel>;
}
