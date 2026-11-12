"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileArchive, FileSpreadsheet, FileText, Folder, FolderOpen, List, MonitorPlay } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, ConsoleButtonLink, PageHeader, Pill, SearchField, SegmentedControl, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { MOM_CABINET_MIGRATION } from "@/lib/pra-wam/minutes-photos";
import {
  CABINET_EXPORT_LIMIT, filterEntries, filterOptions, monthName, NO_FILTER, pdfName, photoName, placeEntries,
  type CabinetFilter, type CabinetPhoto, type CabinetView, type PlacedEntry,
} from "@/lib/pra-wam/mom-cabinet";
import { momCabinetApi } from "@/lib/routes";
import { zipStore, type ZipFile } from "@/lib/zip-store";
import css from "./mom-cabinet.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Mode = "daftar" | "folder";
type Progress = { label: string; done: number; total: number } | null;

const LEVELS = ["Bulan", "Kegiatan", "Tanggal", "Tim"] as const;
const longDay = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const hours = (entry: PlacedEntry) => (entry.from && entry.to ? `${entry.from}–${entry.to} WIB` : "");

/** Saves bytes the browser made as a file. */
function save(bytes: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A file from the server, or its message when it refuses. */
async function fetchFile(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, { ...init, signal, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const message = await response.json().then(body => (body as { message?: string }).message).catch(() => null);
    throw new Error(message || `Server menolak (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Runs the jobs a few at a time, in order of the list, stopping at the first failure. */
async function inTurn<T>(jobs: readonly (() => Promise<T>)[], each: () => void, at = 3): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(at, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
      each();
    }
  }));
  return results;
}

/**
 * Admin WAM → Lemari MoM (12 Nov 2026), for the administration team: every sent MoM with its PDF
 * and photos, as a list or as folders like the panitia's documentation archive (month, activity,
 * day, team). What is shown can be exported: Excel rekap, the PDFs as a zip, the photos as a zip,
 * each in its meeting's folder. A photo can go to the office TV.
 */
export function PraWamMomCabinet({ initial, crumbs = [] }: { initial: CabinetView; crumbs?: readonly Crumb[] }) {
  const [view, setView] = useState(initial);
  const [filter, setFilter] = useState<CabinetFilter>(NO_FILTER);
  const [mode, setMode] = useState<Mode>("folder");
  const [path, setPath] = useState<string[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const stop = useRef<AbortController | null>(null);

  const options = useMemo(() => filterOptions(view.entries), [view.entries]);
  const placed = useMemo(() => placeEntries(filterEntries(view.entries, filter)), [view.entries, filter]);
  const inFolder = useMemo(() => placed.filter(entry => path.every((name, level) => entry.path[level] === name)), [placed, path]);
  const scope = mode === "folder" ? inFolder : [...placed].reverse();
  const photos = scope.reduce((sum, entry) => sum + entry.photos.length, 0);
  const photoBytes = scope.reduce((sum, entry) => sum + entry.photos.reduce((total, photo) => total + photo.size, 0), 0);
  const where = mode === "folder" && path.length ? path[path.length - 1] : filter.month ? monthName(filter.month) : "semua";

  /** The folders one level down, with how many MoMs and photos each holds; months newest first. */
  const children = useMemo(() => {
    if (path.length >= 4) return [];
    const groups = new Map<string, { name: string; moms: number; photos: number; first: string }>();
    for (const entry of inFolder) {
      const name = entry.path[path.length];
      const group = groups.get(name) ?? { name, moms: 0, photos: 0, first: entry.date };
      group.moms += 1; group.photos += entry.photos.length; group.first = group.first < entry.date ? group.first : entry.date;
      groups.set(name, group);
    }
    const list = [...groups.values()].sort((a, b) => a.first.localeCompare(b.first) || a.name.localeCompare(b.name));
    return path.length === 0 ? list.reverse() : list;
  }, [inFolder, path]);

  function changeFilter(change: Partial<CabinetFilter>) { setFilter(current => ({ ...current, ...change })); setPath([]); }

  async function run(key: string, label: string, work: (signal: AbortSignal, step: () => void) => Promise<void>, total: number) {
    const controller = new AbortController();
    stop.current = controller;
    setBusy(key); setMessage(null); setProgress({ label, done: 0, total });
    try {
      await work(controller.signal, () => setProgress(current => current && { ...current, done: current.done + 1 }));
    } catch (problem) {
      if (!controller.signal.aborted) setMessage({ tone: "error", text: problem instanceof Error ? problem.message : errorMessage(problem) });
      else setMessage({ tone: "error", text: "Ekspor dibatalkan." });
    } finally { setBusy(null); setProgress(null); stop.current = null; }
  }

  const zipName = (kind: string) => `Lemari MoM - ${kind} - ${where}.zip`.replace(/[\\/:*?"<>|]/g, "-");

  function exportExcel() {
    void run("excel", "Menyusun Excel rekap", async signal => {
      const bytes = await fetchFile(momCabinetApi.export, signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: scope.map(entry => entry.sessionId) }) });
      save(bytes, `Rekap MoM - ${where}.xlsx`.replace(/[\\/:*?"<>|]/g, "-"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      setMessage({ tone: "success", text: `Excel rekap ${scope.length} MoM tersimpan.` });
    }, 1);
  }

  function exportPdfs() {
    void run("pdf", "Menyiapkan PDF", async (signal, step) => {
      const files = await inTurn(scope.map(entry => async (): Promise<ZipFile> =>
        ({ name: `${entry.path.join("/")}/${pdfName(entry)}`, bytes: await fetchFile(momCabinetApi.pdf(entry.sessionId), signal) })), step);
      save(zipStore(files), zipName("PDF"), "application/zip");
      setMessage({ tone: "success", text: `${files.length} PDF MoM tersimpan dalam satu ZIP, per folder.` });
    }, scope.length);
  }

  function exportPhotos() {
    if (photos > CABINET_EXPORT_LIMIT.files || photoBytes > CABINET_EXPORT_LIMIT.bytes) {
      setMessage({ tone: "error", text: `Terlalu besar untuk sekali unduh (${photos} foto, ${megabytes(photoBytes)}). Pilih satu bulan atau buka satu folder dulu.` });
      return;
    }
    const jobs = scope.flatMap(entry => entry.photos.map((photo, index) => ({ entry, photo, index })));
    void run("foto", "Mengambil foto", async (signal, step) => {
      const files = await inTurn(jobs.map(({ entry, photo, index }) => async (): Promise<ZipFile> =>
        ({ name: `${entry.path.join("/")}/${photoName(entry, index)}`, bytes: await fetchFile(momCabinetApi.photoFile(photo.id), signal), date: new Date(photo.at) })), step, 4);
      save(zipStore(files), zipName("Foto"), "application/zip");
      setMessage({ tone: "success", text: `${files.length} foto tersimpan dalam satu ZIP, per folder.` });
    }, jobs.length);
  }

  async function toTv(entry: PlacedEntry, photo: CabinetPhoto, index: number) {
    const sensitive = entry.telegramOff ? "\n\nMoM ini ditandai Jangan kirim ke Telegram (meeting sensitif). Pastikan fotonya boleh dilihat semua orang di kantor." : "";
    if (!window.confirm(`Tampilkan foto ${index + 1} dari "${entry.title}" di TV kantor?${sensitive}`)) return;
    setBusy(`tv:${photo.id}`); setMessage(null);
    try {
      const result = await adminRequest<CabinetView>(momCabinetApi.photoTv(photo.id), { method: "POST", body: JSON.stringify({ title: `${entry.title} · ${longDay(entry.date)}`.slice(0, 80) }) });
      if (result.data) setView(result.data);
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  const exportBar = <div className={css.exports}>
    <p className={css.scope}>{scope.length} MoM · {photos} foto{photos ? ` (${megabytes(photoBytes)})` : ""}</p>
    <div className={css.buttons}>
      <ConsoleButton icon={<FileSpreadsheet size={16} aria-hidden="true" />} disabled={!scope.length || busy !== null} onClick={exportExcel}>Excel rekap</ConsoleButton>
      <ConsoleButton icon={<FileArchive size={16} aria-hidden="true" />} disabled={!scope.length || busy !== null} onClick={exportPdfs}>ZIP PDF</ConsoleButton>
      <ConsoleButton icon={<FileArchive size={16} aria-hidden="true" />} disabled={!photos || busy !== null} onClick={exportPhotos}>ZIP foto</ConsoleButton>
    </div>
    {progress && <div className={css.progress} role="status">
      <span>{progress.label} {progress.done} dari {progress.total}…</span>
      <progress max={progress.total} value={progress.done} />
      <ConsoleButton onClick={() => stop.current?.abort()}>Batalkan</ConsoleButton>
    </div>}
  </div>;

  /** One meeting: what the MoM says in short, its PDF, and its photos. */
  const meeting = (entry: PlacedEntry) => <article key={entry.sessionId} className={css.meeting}>
    <div className={css.meetingHead}>
      <div className={css.meetingTitle}>
        <strong>{entry.title}</strong>
        <span className={css.muted}>{entry.code} · versi {entry.version}</span>
      </div>
      <div className={css.buttons}>
        <ConsoleButtonLink href={momCabinetApi.pdf(entry.sessionId)} icon={<FileText size={16} aria-hidden="true" />}>Unduh PDF</ConsoleButtonLink>
        {mode === "daftar" && <ConsoleButton icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => { setMode("folder"); setPath([...entry.path]); }}>Buka folder</ConsoleButton>}
      </div>
    </div>
    <dl className={css.facts}>
      <div><dt>Tanggal</dt><dd>{longDay(entry.date)}{hours(entry) ? ` · ${hours(entry)}` : ""}</dd></div>
      <div><dt>Departemen</dt><dd>{entry.department}</dd></div>
      <div><dt>Tempat</dt><dd>{entry.place || "-"}</dd></div>
      <div><dt>Chairperson</dt><dd>{entry.chair ?? "-"}</dd></div>
      <div><dt>Minute Taker</dt><dd>{entry.notetaker ?? "-"}</dd></div>
      <div><dt>Hadir</dt><dd>{entry.present} dari {entry.total}{entry.guests ? ` + ${entry.guests} lainnya` : ""}</dd></div>
      <div><dt>Isi</dt><dd>{entry.topics} topik · {entry.decisions} keputusan · {entry.actions} tindak lanjut{entry.open ? ` (${entry.open} Open)` : ""}</dd></div>
    </dl>
    <p className={css.pills}>
      {entry.telegramOff ? <Pill tone="warn">Tidak ke Telegram (sensitif)</Pill> : <Pill tone="ok">Terkirim ke Telegram</Pill>}
      <Pill tone="neutral">{entry.photos.length} foto</Pill>
    </p>
    {mode === "folder" && entry.photos.length > 0 && <ul className={css.gallery} aria-label={`Foto ${entry.title}`}>
      {entry.photos.map((photo, index) => <li key={photo.id} className={css.photo}>
        <a href={momCabinetApi.photo(photo.id)} target="_blank" rel="noopener" className={css.thumb} aria-label={`Buka foto ${index + 1} (tab baru)`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed address that expires */}
          <img src={momCabinetApi.photo(photo.id)} alt="" loading="lazy" decoding="async" />
        </a>
        <div className={css.photoBar}>
          <span className={css.muted}>{photo.width && photo.height ? `${photo.width}×${photo.height}` : ""} · {megabytes(photo.size)}</span>
          <div className={css.buttons}>
            <a className={css.iconLink} href={momCabinetApi.photoDownload(photo.id, photoName(entry, index))} aria-label={`Unduh foto ${index + 1}`}><Download size={16} aria-hidden="true" /></a>
            {photo.onTv ? <Pill tone="ok">Di TV</Pill>
              : view.tvReady && <ConsoleButton icon={<MonitorPlay size={16} aria-hidden="true" />} disabled={busy !== null} onClick={() => { void toTv(entry, photo, index); }}>
                {busy === `tv:${photo.id}` ? "Mengirim…" : "Tampilkan di TV"}
              </ConsoleButton>}
          </div>
        </div>
      </li>)}
    </ul>}
  </article>;

  return <div className="stack">
    <PageHeader crumbs={crumbs} title="Lemari MoM"
      subtitle="Semua MoM yang sudah dikirim, dengan PDF dan foto meetingnya, tersusun seperti arsip dokumentasi panitia: bulan, kegiatan, tanggal, lalu tim." />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!view.migrated && <Notice tone="warning">Lemari MoM menunggu migrasi notulen. Setelah dijalankan, MoM yang dikirim muncul di sini.</Notice>}
    {view.migrated && !view.tvReady && <Notice tone="info">Foto Full HD (1 MB) dan Tampilkan di TV menunggu migrasi {MOM_CABINET_MIGRATION}. Sementara itu foto tetap disimpan 1280 px.</Notice>}

    <Card title="Cari dan ekspor">
      <div className={css.toolbar}>
        <SearchField label="Cari MoM" placeholder="Nomor, meeting, departemen, notulis" value={filter.query} onChange={query => changeFilter({ query })} />
        <select className="select" aria-label="Bulan" value={filter.month} onChange={event => changeFilter({ month: event.target.value })}>
          <option value="">Semua bulan</option>
          {options.months.map(month => <option key={month} value={month}>{monthName(month)}</option>)}
        </select>
        <select className="select" aria-label="Departemen" value={filter.department} onChange={event => changeFilter({ department: event.target.value })}>
          <option value="">Semua departemen</option>
          {options.departments.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <SegmentedControl label="Tampilan" value={mode} onChange={value => { setMode(value); setPath([]); }} options={[
          { value: "folder", label: "Folder", icon: <Folder size={16} aria-hidden="true" /> },
          { value: "daftar", label: "Daftar", icon: <List size={16} aria-hidden="true" /> },
        ]} />
      </div>
      {exportBar}
    </Card>

    {mode === "folder" && <nav aria-label="Letak folder" className={css.crumbs}>
      <button type="button" className={css.crumb} aria-current={path.length === 0 ? "page" : undefined} onClick={() => setPath([])}><FolderOpen size={16} aria-hidden="true" /> Lemari</button>
      {path.map((name, level) => <span key={level} className={css.crumbStep}>
        <ChevronRight size={14} aria-hidden="true" />
        <button type="button" className={css.crumb} aria-current={level === path.length - 1 ? "page" : undefined} onClick={() => setPath(path.slice(0, level + 1))}>{name}</button>
      </span>)}
    </nav>}

    {!placed.length ? <Card title="Lemari kosong"><p className={css.empty}>{view.entries.length ? "Tidak ada MoM yang cocok dengan pencarian ini." : "Belum ada MoM yang dikirim."}</p></Card>
      : mode === "folder" && path.length < 4 ? <section aria-label={`Folder ${LEVELS[path.length]}`}>
        <p className={css.level}>{LEVELS[path.length]}</p>
        <ul className={css.folders}>{children.map(child => <li key={child.name}>
          <button type="button" className={css.folder} onClick={() => setPath([...path, child.name])}>
            <Folder size={22} aria-hidden="true" />
            <span className={css.folderName}>{child.name}</span>
            <span className={css.muted}>{child.moms} MoM · {child.photos} foto</span>
          </button>
        </li>)}</ul>
      </section>
      : <div className={css.meetings}>{scope.map(meeting)}</div>}
  </div>;
}
