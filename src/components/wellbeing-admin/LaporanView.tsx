"use client";

import { useState, type ReactNode } from "react";
import { Activity, ClipboardCheck, Download, FileSpreadsheet, HandCoins, ListChecks, Trophy, Users } from "lucide-react";
import { Card, ConsoleButton, PageHeader, SegmentedControl, StatCard, StatRow } from "@/components/console";
import { Panel, Skeleton } from "@/components/app-shell/Panel";
import { useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { wellbeingAdminApi } from "@/lib/routes";
import { DIMENSIONS, dimensionLabels, wibToday } from "@/lib/wellbeing/rules";
import { monthName, points, wb } from "./api";
import { DimensionIcon, LoadError, Refreshing } from "./parts";
import { useWbActions } from "./WellbeingAdmin";
import css from "./wellbeing-admin.module.css";

/*
 * Laporan (17 Nov 2026): the data as Excel, chosen in a panel (Unduh Excel opens it from Hari ini,
 * Periksa and here), and this month at a glance. Three reports, each one sheet plus Keterangan:
 * Rekap poin per karyawan (prizes, HR), Daftar aktivitas (as Periksa filters them, or the ones ticked
 * there), Poin dari admin. Numbers are real numbers in Excel.
 */

export type ExportData = "people" | "activities" | "points";
export type ExportPeriod = "month" | "last_month" | "range" | "all";
export type ExportStatus = "all" | "unchecked" | "adjusted" | "rejected";
export type ExportKind = "all" | "daily" | "sport" | "strava";
export type ExportPreset = { data?: ExportData; period?: ExportPeriod; status?: ExportStatus; kind?: ExportKind; ids?: string[] };

const REPORTS: { data: ExportData; title: string; text: string; icon: ReactNode }[] = [
  { data: "people", title: "Rekap poin per karyawan", text: "Peringkat, total, dan poin per dimensi tiap karyawan. Untuk hadiah juara dan laporan HR.", icon: <Trophy size={22} aria-hidden="true" /> },
  { data: "activities", title: "Daftar aktivitas", text: "Setiap aktivitas: tanggal, jam, kegiatan, kalori atau langkah, poin, status periksa, dan alasan admin.", icon: <ListChecks size={22} aria-hidden="true" /> },
  { data: "points", title: "Poin dari admin", text: "Poin acara kantor, koreksi, dan saldo dari aplikasi lama, dengan alasan dan siapa yang memberi.", icon: <HandCoins size={22} aria-hidden="true" /> },
];

/** POST the choice; the answer is the .xlsx (saved under its own name) or a JSON message. */
export async function downloadExport(body: ExportPreset & { data: ExportData; from?: string; to?: string }): Promise<string> {
  let response: Response;
  try {
    response = await fetch(wellbeingAdminApi.export, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { throw new Error("Tidak dapat terhubung. Periksa jaringan lalu coba lagi."); }
  if (!response.ok || !(response.headers.get("Content-Type") ?? "").includes("spreadsheetml")) {
    let message = response.status === 401 ? "Sesi admin berakhir. Masuk lagi, lalu unduh ulang." : "Laporan belum bisa dibuat. Coba lagi.";
    try { const json = await response.json() as { message?: string }; if (json?.message) message = json.message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "wellbeing.xlsx";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return name;
}

export function LaporanView() {
  const overview = useResource(wb.overview.key, wb.overview.fetch);
  const month = wb.people("month");
  const people = useResource(month.key, month.fetch);
  const { openExport } = useWbActions();
  const data = overview.data;
  const dims = DIMENSIONS.map(dimension => ({ dimension, value: (people.data?.rows ?? []).reduce((sum, row) => sum + Math.max(0, row.dims[dimension] ?? 0), 0) }));
  const dimTotal = dims.reduce((sum, item) => sum + item.value, 0);
  return <>
    <PageHeader title="Laporan" subtitle="Unduh data Wellbeing sebagai Excel untuk laporan, hadiah juara, atau HR." />
    <Refreshing on={overview.refreshing || people.refreshing} />
    <div className={css.stack}>
      <ul className={css.reportGrid} aria-label="Jenis laporan">
        {REPORTS.map(report => <li key={report.data} className={css.reportCard}>
          <span className={css.reportIcon} aria-hidden="true">{report.icon}</span>
          <strong>{report.title}</strong>
          <p>{report.text}</p>
          <ConsoleButton variant={report.data === "people" ? "primary" : "secondary"} icon={<FileSpreadsheet size={18} aria-hidden="true" />} onClick={() => openExport({ data: report.data })}>Unduh Excel</ConsoleButton>
        </li>)}
      </ul>

      <Card title={data ? `Ringkasan ${monthName(data.month.from)}` : "Ringkasan bulan ini"}>
        {overview.error && !data ? <LoadError message={overview.error} onRetry={() => void overview.reload()} />
          : !data ? <div className={css.statSkeleton}>{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={104} radius={16} />)}</div>
          : <StatRow label="Ringkasan bulan ini">
              <StatCard label="Poin" value={points(data.month.points)} tone="blue" icon={<Trophy size={20} />} note="semua dimensi" />
              <StatCard label="Aktivitas" value={points(data.month.activities)} icon={<Activity size={20} />} note="tercatat bulan ini" />
              <StatCard label="Ikut" value={`${data.month.people} / ${data.participants}`} icon={<Users size={20} />} note="orang dengan poin / aktif" />
              <StatCard label="Belum diperiksa" value={points(data.unchecked)} tone={data.unchecked ? "warn" : "ok"} icon={<ClipboardCheck size={20} />} note="semua bulan" />
            </StatRow>}
        <h3 className={css.subhead}>Poin per dimensi</h3>
        {people.error && !people.data ? <LoadError message={people.error} onRetry={() => void people.reload()} />
          : !people.data ? <div className={css.dimTiles}>{DIMENSIONS.map(dimension => <Skeleton key={dimension} height={92} radius={14} />)}</div>
          : <ul className={css.dimTiles} aria-label="Poin per dimensi bulan ini">
              {dims.map(item => <li key={item.dimension}>
                <DimensionIcon dimension={item.dimension} size={36} />
                <small>{dimensionLabels[item.dimension]}</small>
                <strong>{points(item.value)}</strong>
                <span className={css.help}>{dimTotal ? `${Math.round(item.value / dimTotal * 100)}%` : "0%"}</span>
              </li>)}
            </ul>}
      </Card>
    </div>
  </>;
}

const PERIODS: { value: ExportPeriod; label: string }[] = [
  { value: "month", label: "Bulan ini" }, { value: "last_month", label: "Bulan lalu" }, { value: "range", label: "Pilih tanggal" }, { value: "all", label: "Semua" },
];

/** Unduh Excel: what, for when, and (for activities) which ones; or the activities ticked in Periksa. */
export function ExportPanel({ open, preset, onClose }: { open: boolean; preset: ExportPreset; onClose: () => void }) {
  const toast = useToast();
  const today = wibToday();
  const [form, setForm] = useState({ data: preset.data ?? "people" as ExportData, period: preset.period ?? "month" as ExportPeriod, from: "", to: today, status: preset.status ?? "all" as ExportStatus, kind: preset.kind ?? "all" as ExportKind });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const ids = preset.ids;

  async function download() {
    setProblem("");
    if (ids && ids.length > 500) return setProblem("Paling banyak 500 aktivitas sekali unduh. Kurangi pilihan, atau pakai Laporan → Daftar aktivitas dengan periode.");
    if (!ids && form.period === "range" && (!form.from || !form.to)) return setProblem("Isi tanggal mulai dan akhir.");
    if (!ids && form.period === "range" && form.from > form.to) return setProblem("Tanggal akhir sebelum tanggal mulai.");
    setBusy(true);
    try {
      const name = await downloadExport(ids
        ? { data: "activities", ids }
        : { data: form.data, period: form.period, ...(form.period === "range" ? { from: form.from, to: form.to } : {}), ...(form.data === "activities" ? { status: form.status, kind: form.kind } : {}) });
      toast({ message: `${name} diunduh.`, tone: "ok" });
      onClose();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Laporan belum bisa dibuat."); }
    finally { setBusy(false); }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  return <Panel open={open} onClose={onClose} locked={busy} title="Unduh Excel"
    subtitle={ids ? `${ids.length} aktivitas yang dipilih di Periksa.` : "Pilih datanya dan periodenya. Berkas .xlsx bisa dibuka di Excel, Google Sheets, atau Numbers."}
    footer={<><ConsoleButton onClick={onClose} disabled={busy}>Batal</ConsoleButton>
      <ConsoleButton variant="primary" icon={busy ? undefined : <Download size={18} aria-hidden="true" />} onClick={() => void download()} disabled={busy}>{busy ? "Menyiapkan…" : "Unduh Excel"}</ConsoleButton></>}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); void download(); }}>
      {!ids && <fieldset className={css.choices}>
        <legend>Data</legend>
        {REPORTS.map(report => <label key={report.data} className={css.choice} data-on={form.data === report.data}>
          <input type="radio" name="export-data" value={report.data} checked={form.data === report.data} onChange={() => set("data", report.data)} />
          <span className={css.reportIcon} aria-hidden="true">{report.icon}</span>
          <span><strong>{report.title}</strong><small>{report.text}</small></span>
        </label>)}
      </fieldset>}
      {!ids && <div className={css.field}>
        <span>Periode</span>
        <SegmentedControl label="Periode" value={form.period} onChange={value => set("period", value)} options={PERIODS} />
      </div>}
      {!ids && form.period === "range" && <div className={css.fieldRow}>
        <label className={css.field}><span>Dari</span><input className={css.input} type="date" value={form.from} max={form.to || today} onChange={event => set("from", event.target.value)} /></label>
        <label className={css.field}><span>Sampai</span><input className={css.input} type="date" value={form.to} min={form.from || undefined} max={today} onChange={event => set("to", event.target.value)} /></label>
      </div>}
      {!ids && form.data === "activities" && <div className={css.fieldRow}>
        <label className={css.field}><span>Status</span>
          <select className={css.select} value={form.status} onChange={event => set("status", event.target.value as ExportStatus)}>
            <option value="all">Semua status</option><option value="unchecked">Belum diperiksa</option><option value="adjusted">Diubah admin</option><option value="rejected">Ditolak</option>
          </select></label>
        <label className={css.field}><span>Jenis</span>
          <select className={css.select} value={form.kind} onChange={event => set("kind", event.target.value as ExportKind)}>
            <option value="all">Semua jenis</option><option value="daily">Kegiatan harian</option><option value="sport">Olahraga</option><option value="strava">Dari Strava</option>
          </select></label>
      </div>}
      <p className={css.help}>Tanggal mengikuti tanggal kegiatan (WIB). Lembar <b>Keterangan</b> di dalam berkas mencatat periode, saringan, dan siapa yang mengunduh.</p>
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </form>
  </Panel>;
}
