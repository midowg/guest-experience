"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { acceptDocuments, documentMimes, documentTypes, MAX_DOCUMENT_BYTES, sizeLabel, type DocumentMime, type PraWamDocument } from "@/lib/pra-wam/documents";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import styles from "./pra-wam.module.css";

type Props = {
  documents: PraWamDocument[];
  /** Fixed on a session's page; otherwise panitia picks one (or none, for everyone). */
  sessionId?: string;
  sessions?: { id: string; title: string }[];
  canUpload: boolean;
  storage: boolean;
};

const dateLabel = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** Documents to open, and (when allowed) a small form to add one. */
export function DocumentList({ documents, sessionId, sessions, canUpload, storage }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(sessionId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

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
      if (!put?.ok) throw new PraWamApiError("Unggahan ke penyimpanan gagal. Periksa jaringan lalu coba lagi.");
      await praWamRequest(praWamApi.documents(), { method: "POST", json: { ...agreed, key: start.data.key, token: start.data.token } });
      setFile(null); setTitle("");
      setNotice({ tone: "success", text: "Dokumen diunggah." });
      router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }

  async function remove(document: PraWamDocument) {
    if (!window.confirm(`Hapus "${document.title}"?`)) return;
    setBusy(document.id); setNotice(null);
    try { await praWamRequest(praWamApi.documents(document.id), { method: "DELETE" }); router.refresh(); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }

  return <div className={styles.section}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {documents.length === 0 ? <p className={styles.meta}>Belum ada dokumen.</p> : <div className={styles.mine}>
      {documents.map(document => <article key={document.id} className={styles.mineItem}>
        <h3><a href={praWamApi.documents(document.id)} target="_blank" rel="noopener">{document.title}</a></h3>
        <span className={styles.meta}>{documentTypes[document.mime as DocumentMime]?.label ?? "Berkas"} · {sizeLabel(document.size)} · {document.uploadedBy}, {dateLabel(document.createdAt)}</span>
        {!sessionId && <span className={styles.meta}>{document.sessionTitle ? `Sesi: ${document.sessionTitle}` : "Untuk semua"}</span>}
        {document.canDelete && <div className={styles.actions}><button type="button" className="button button--quiet" disabled={!!busy} onClick={() => remove(document)}>{busy === document.id ? "Menghapus…" : "Hapus"}</button></div>}
      </article>)}
    </div>}

    {canUpload && (storage ? <form className={`${styles.section} ${styles.detail}`} onSubmit={upload}>
      <h3>Unggah dokumen</h3>
      <div><label className={styles.label} htmlFor="doc-file">Berkas</label>
        <input id="doc-file" type="file" accept={acceptDocuments} onChange={event => choose(event.target.files?.[0] ?? null)} />
        <p className={styles.hint}>PDF, Word, Excel, PowerPoint, JPG, atau PNG. Paling besar 25 MB.</p></div>
      <div><label className={styles.label} htmlFor="doc-title">Judul</label>
        <input id="doc-title" className="input" value={title} maxLength={150} onChange={event => setTitle(event.target.value)} /></div>
      {!sessionId && sessions && <div><label className={styles.label} htmlFor="doc-session">Untuk</label>
        <select id="doc-session" className="select" value={target} onChange={event => setTarget(event.target.value)}>
          <option value="">Semua peserta Pra WAM</option>
          {sessions.map(session => <option key={session.id} value={session.id}>Sesi: {session.title}</option>)}
        </select></div>}
      <div><Button type="submit" disabled={!!busy || !file || title.trim().length < 2}>{busy === "upload" ? "Mengunggah…" : "Unggah"}</Button></div>
    </form> : <Notice tone="info">Penyimpanan dokumen belum disiapkan, jadi unggah belum bisa dipakai.</Notice>)}
  </div>;
}
