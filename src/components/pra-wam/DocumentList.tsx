"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, Trash2, Upload } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { acceptDocuments, documentMimes, MAX_DOCUMENT_BYTES, sizeLabel, type DocumentMime, type PraWamDocument } from "@/lib/pra-wam/documents";
import { praWamApi } from "@/lib/routes";
import { useConfirm } from "./ConfirmDialog";
import { useSessionIntent } from "./SessionActions";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import styles from "./pra-wam.module.css";
import rows from "./peserta.module.css";

type Filter = "semua" | "umum" | "sesi" | "saya";
type Props = {
  documents: PraWamDocument[];
  /** Fixed on a session's page; otherwise panitia picks one (or none, for everyone). */
  sessionId?: string;
  sessions?: { id: string; title: string }[];
  canUpload: boolean;
  storage: boolean;
  /** Dokumen page: filter chips and groups per session, as in Penpot "P8 · Dokumen". */
  grouped?: boolean;
  /** To mark "Unggahan saya": the uploader names the list carries. */
  viewerName?: string;
  uploadLabel?: string;
  /** Detail sesi (Penpot P3 "Materi"): rows on the page, no card, and the upload button lives in the page's action bar. */
  plain?: boolean;
};

const dayLabel = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const filters: { id: Filter; label: string }[] = [{ id: "semua", label: "Semua" }, { id: "umum", label: "Umum acara" }, { id: "sesi", label: "Sesi saya" }, { id: "saya", label: "Unggahan saya" }];

/** Documents to open (one row each, "Buka" on the right), and when allowed a way to add one. */
export function DocumentList({ documents, sessionId, sessions, canUpload, storage, grouped, viewerName, uploadLabel = "Unggah dokumen", plain }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("semua");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(sessionId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const form = useRef<HTMLFormElement>(null);
  // "Unggah materi" in the page's action bar (or #unggah-materi in the address) opens the form.
  useSessionIntent("unggah-materi", () => setOpen(true), !!sessionId && canUpload && storage);
  useEffect(() => {
    if (!open || !form.current) return;
    form.current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    form.current.querySelector<HTMLInputElement>("#doc-file")?.focus({ preventScroll: true });
  }, [open]);

  function choose(next: File | null) {
    setNotice(null);
    if (next && !documentMimes.includes(next.type as DocumentMime)) { setNotice({ tone: "error", text: "Jenis berkas: PDF, Word, Excel, PowerPoint, JPG, atau PNG." }); setFile(null); return; }
    if (next && next.size > MAX_DOCUMENT_BYTES) { setNotice({ tone: "error", text: "Berkas lebih dari 25 MB." }); setFile(null); return; }
    setFile(next);
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 150));
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy("upload"); setNotice(null);
    const agreed = { title, sessionId: target, filename: file.name, mime: file.type, size: file.size };
    try {
      const start = await praWamRequest<{ key: string; uploadUrl: string; token: string }>(praWamApi.documentUpload, { method: "POST", json: agreed });
      const put = await fetch(start.data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } }).catch(() => null);
      // No response at all while online is the storage refusing this site (its CORS rule), not the
      // person's network; say so, so they tell the admin instead of retrying.
      if (!put) throw new PraWamApiError(navigator.onLine
        ? "Penyimpanan dokumen menolak unggahan dari aplikasi ini. Ini pengaturan server, bukan jaringanmu. Hubungi admin WAM."
        : "Kamu sedang offline. Sambungkan internet lalu coba lagi.");
      if (!put.ok) throw new PraWamApiError(`Penyimpanan menolak berkas ini (kode ${put.status}). Coba lagi, atau hubungi admin WAM bila terus terjadi.`);
      await praWamRequest(praWamApi.documents(), { method: "POST", json: { ...agreed, key: start.data.key, token: start.data.token } });
      setFile(null); setTitle(""); setOpen(false);
      setNotice({ tone: "success", text: "Dokumen diunggah." });
      router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }

  async function remove(document: PraWamDocument) {
    if (!(await confirm({
      title: "Hapus dokumen?",
      body: `"${document.title}" hilang untuk semua yang bisa melihatnya dan tidak bisa dikembalikan.`,
      confirmLabel: "Hapus dokumen",
      danger: true,
    }))) return;
    setBusy(document.id); setNotice(null);
    try { await praWamRequest(praWamApi.documents(document.id), { method: "DELETE" }); setNotice({ tone: "success", text: "Dokumen dihapus." }); router.refresh(); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }

  const shown = documents.filter(document => filter === "semua" || (filter === "umum" ? !document.sessionId : filter === "sesi" ? !!document.sessionId : document.uploadedBy === viewerName));
  const groups = grouped
    ? [...new Map(shown.map(document => [document.sessionId ?? "", document.sessionTitle ?? "Umum acara"])).entries()]
      .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : 0))
      .map(([key, label]) => ({ key, label, items: shown.filter(document => (document.sessionId ?? "") === key) }))
    : [{ key: "all", label: "", items: shown }];
  const row = (document: PraWamDocument) => <div key={document.id} className={rows.docRow}>
    <span className={styles.tile}><FileText aria-hidden /></span>
    <span className={rows.docBody}>
      <strong>{document.title}</strong>
      <span className={styles.meta}>{sizeLabel(document.size)} · {!sessionId && !grouped ? (document.sessionTitle ? `sesi ${document.sessionTitle}` : "umum acara") : document.uploadedBy === viewerName ? "unggahan kamu" : document.uploadedBy} · {dayLabel(document.createdAt)}</span>
    </span>
    <a className={rows.docOpen} href={praWamApi.documents(document.id)} target="_blank" rel="noopener" aria-label={`Buka ${document.title}`}>Buka</a>
    {document.canDelete && <button type="button" className={rows.docDelete} disabled={!!busy} onClick={() => remove(document)} aria-label={busy === document.id ? "Menghapus…" : `Hapus ${document.title}`}><Trash2 aria-hidden /></button>}
  </div>;

  const uploadButton = canUpload && storage && !open && <Button type="button" variant={grouped ? "primary" : "secondary"} onClick={() => setOpen(true)}><Upload size={18} aria-hidden /> {uploadLabel}</Button>;
  const empty = <div className={rows.empty}>
    <span className={rows.emptyMark}><FolderOpen aria-hidden /></span>
    <strong>{filter === "semua" ? "Belum ada dokumen" : "Tidak ada dokumen di saringan ini"}</strong>
    <span className={styles.meta}>{filter === "semua" ? "Bahan sesi dan dokumen umum acara akan muncul di sini." : "Coba saringan lain."}</span>
  </div>;
  // Dokumen page on a desktop: one table with the place of each document as a column.
  const table = <div className={rows.table} role="table" aria-label="Dokumen">
    <div className={rows.tableHead} role="row">
      <span role="columnheader">Dokumen</span><span role="columnheader">Untuk</span><span role="columnheader">Ukuran</span><span role="columnheader">Diunggah</span><span role="columnheader" aria-label="Aksi" />
    </div>
    {shown.map(document => <div key={document.id} className={rows.tableRow} role="row">
      <span role="cell" className={rows.tableTitle}><span className={styles.tile}><FileText aria-hidden /></span><strong>{document.title}</strong></span>
      <span role="cell">{document.sessionTitle ? <span className={`${styles.pill} ${styles.pillLine}`}>{document.sessionTitle}</span> : <span className={`${styles.pill} ${styles.pillBrass}`}>Umum acara</span>}</span>
      <span role="cell" className={styles.meta}>{sizeLabel(document.size)}</span>
      <span role="cell" className={styles.meta}>{document.uploadedBy === viewerName ? "Kamu" : document.uploadedBy} · {dayLabel(document.createdAt)}</span>
      <span role="cell" className={rows.tableActions}>
        <a className={rows.docOpen} href={praWamApi.documents(document.id)} target="_blank" rel="noopener" aria-label={`Buka ${document.title}`}>Buka</a>
        {document.canDelete && <button type="button" className={rows.docDelete} disabled={!!busy} onClick={() => remove(document)} aria-label={busy === document.id ? "Menghapus…" : `Hapus ${document.title}`}><Trash2 aria-hidden /></button>}
      </span>
    </div>)}
  </div>;

  return <div>
    {grouped && <div className={rows.toolbar}>
      <div className={rows.filters} role="group" aria-label="Saring dokumen">
        {filters.map(item => <button key={item.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
      {uploadButton}
    </div>}
    {confirmDialog}
    {notice && <div style={{ marginBottom: 12 }} role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
    {shown.length === 0 ? (grouped ? empty : <p className={styles.meta}>{plain ? "Belum ada materi untuk sesi ini." : "Belum ada dokumen."}</p>) : <>
      {grouped && <div className={rows.deskOnly}>{table}</div>}
      <div className={grouped ? rows.phoneOnly : undefined}>{groups.map(group => <div key={group.key}>
        {group.label && <p className={rows.groupLabel}>{group.label}</p>}
        <div className={plain ? rows.docPlain : rows.docList}>{group.items.map(row)}</div>
      </div>)}</div>
    </>}

    {canUpload && (storage ? <>
      {!grouped && !plain && uploadButton && <div style={{ marginTop: 12 }}>{uploadButton}</div>}
      {open && <form ref={form} id="unggah-materi" className={`${styles.section} ${styles.detail} ${rows.uploadForm}`} onSubmit={upload}>
        <h3>{uploadLabel}</h3>
        <div><label className={styles.label} htmlFor="doc-file">Berkas</label>
          <input id="doc-file" type="file" accept={acceptDocuments} onChange={event => choose(event.target.files?.[0] ?? null)} />
          <p className={styles.hint}>PDF, Word, Excel, PowerPoint, JPG, atau PNG. Paling besar 25 MB.</p></div>
        <div><label className={styles.label} htmlFor="doc-title">Judul</label>
          <input id="doc-title" className="input" value={title} maxLength={150} onChange={event => setTitle(event.target.value)} /></div>
        {!sessionId && sessions && <div><label className={styles.label} htmlFor="doc-session">Untuk</label>
          <select id="doc-session" className="select" value={target} onChange={event => setTarget(event.target.value)}>
            <option value="">Semua peserta</option>
            {sessions.map(session => <option key={session.id} value={session.id}>Sesi: {session.title}</option>)}
          </select></div>}
        <div className={styles.actions}>
          <Button type="submit" disabled={!!busy || !file || title.trim().length < 2}>{busy === "upload" ? "Mengunggah…" : "Unggah"}</Button>
          <button type="button" className="button button--quiet" disabled={!!busy} onClick={() => setOpen(false)}>Batal</button>
        </div>
      </form>}
    </> : <div style={{ marginTop: 12 }}><Notice tone="info">Penyimpanan dokumen belum disiapkan, jadi unggah belum bisa dipakai.</Notice></div>)}
  </div>;
}
