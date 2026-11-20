"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, ScanFace, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, FilterChips, PageHeader, Pill, SearchField, type ConsoleTone } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { imageProblemLabels, loadFaceEngine } from "@/components/hr/faceEngine";
import { faceStatusLabels, type FaceRow, type FaceStatus } from "@/lib/hr/attendance";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Filter = "semua" | "tindakan" | FaceStatus;

const tone: Record<FaceStatus, ConsoleTone> = { aktif: "ok", siap: "blue", menunggu: "warn", impor: "neutral", ditolak: "bad" };
const needsAction = (row: FaceRow) => row.status === "impor" || row.status === "menunggu";

/**
 * Admin HR → Wajah terdaftar (20 Nov 2026): every reference face with its photo. "Proses foto impor"
 * reads the GreatDay photos here in this browser with the same engine as the phones (only the
 * numbers are kept); a self-enrolled face that did not match its GreatDay photo waits for Setujui.
 */
export function FaceList({ initial }: { initial: FaceRow[] }) {
  const router = useRouter();
  const [faces, setFaces] = useState(initial);
  const [filter, setFilter] = useState<Filter>(initial.some(needsAction) ? "tindakan" : "semua");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [refusing, setRefusing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const count = (status: FaceStatus) => faces.filter(row => row.status === status).length;
  const counts = useMemo(() => ({ semua: faces.length, tindakan: faces.filter(needsAction).length }), [faces]);
  const needle = query.trim().toLowerCase();
  const shown = faces
    .filter(row => filter === "semua" || (filter === "tindakan" ? needsAction(row) : row.status === filter))
    .filter(row => !needle || `${row.name} ${row.department}`.toLowerCase().includes(needle));
  const imports = faces.filter(row => row.source === "greatday" && row.status === "impor" && row.hasPhoto);

  async function reload() {
    try { const result = await adminRequest<FaceRow[]>(hrAdminApi.faces); setFaces(result.data ?? []); router.refresh(); }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
  }

  async function decide(row: FaceRow, action: "setujui" | "tolak" | "reset") {
    if (action === "reset" && !window.confirm(`Hapus wajah acuan ${row.name}? Orangnya perlu daftar wajah lagi di aplikasi sebelum absen dengan wajah.`)) return;
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<null>(hrAdminApi.face(row.employeeId), { method: "POST", body: JSON.stringify(action === "tolak" ? { action, note } : { action }) });
      setMessage({ tone: "success", text: `${result.message} (${row.name})` });
      setRefusing(null); setNote("");
      await reload();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  /** Reads every imported photo here, one by one, with the phones' engine; the server keeps only the result. */
  async function processImports() {
    if (!imports.length) return;
    setBusy(true); setMessage(null);
    let ready = 0, unreadable = 0;
    try {
      setProgress({ done: 0, total: imports.length, name: "Memuat pengenal wajah…" });
      const engine = await loadFaceEngine();
      for (const [index, row] of imports.entries()) {
        setProgress({ done: index, total: imports.length, name: row.name });
        const response = await fetch(hrAdminApi.facePhoto(row.employeeId), { credentials: "same-origin", cache: "no-store" });
        const check = response.ok ? await engine.analyzeImage(await response.blob()) : { ok: false as const, reason: "tidak_terbaca" as const };
        const body = check.ok ? { action: "proses", embedding: check.embedding } : { action: "proses", problem: imageProblemLabels[check.reason] };
        await adminRequest(hrAdminApi.face(row.employeeId), { method: "POST", body: JSON.stringify(body) });
        if (check.ok) ready += 1; else unreadable += 1;
      }
      setMessage({ tone: "success", text: `Selesai: ${ready} foto terbaca dan siap dipakai (setelah karyawannya setuju), ${unreadable} tidak terbaca (orangnya daftar wajah sendiri di aplikasi).` });
    } catch (error) {
      setMessage({ tone: "error", text: `${ready + unreadable} foto diproses, lalu berhenti: ${errorMessage(error)}. Tekan lagi untuk melanjutkan.` });
    } finally {
      setProgress(null); setBusy(false); await reload();
    }
  }

  return <>
    <PageHeader title="Wajah terdaftar" subtitle="Foto acuan untuk mencocokkan wajah saat absen. Foto dari GreatDay perlu diproses sekali; wajah yang didaftarkan sendiri kadang perlu disetujui." />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

    {(imports.length > 0 || progress) && <Card title="Foto dari GreatDay yang belum diproses">
      <p className={css.muted}>{imports.length} foto akan dibaca di browser ini (butuh sekitar 1–2 detik per foto). Jangan tutup halaman sampai selesai.</p>
      {progress
        ? <div className={css.progress} role="status">
          <span className={css.muted}>{progress.done} dari {progress.total} · {progress.name}</span>
          <span className={css.progressBar}><span style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></span>
        </div>
        : <div className={css.actions}><ConsoleButton variant="primary" icon={<ScanFace size={16} aria-hidden />} disabled={busy} onClick={() => void processImports()}>Proses {imports.length} foto</ConsoleButton></div>}
    </Card>}

    <Card title={`${faces.length} wajah`}>
      <div className={css.toolbar}>
        <SearchField label="Cari karyawan" placeholder="Cari nama atau departemen" value={query} onChange={setQuery} />
      </div>
      <div className={css.toolbar}>
        <FilterChips label="Saring" value={filter} onChange={setFilter} chips={[
          { value: "tindakan", label: "Perlu tindakan", count: counts.tindakan },
          { value: "semua", label: "Semua", count: counts.semua },
          { value: "aktif", label: "Aktif", count: count("aktif") },
          { value: "siap", label: "Menunggu karyawan", count: count("siap") },
          { value: "menunggu", label: "Menunggu disetujui", count: count("menunggu") },
          { value: "impor", label: "Belum diproses", count: count("impor") },
          { value: "ditolak", label: "Perlu daftar ulang", count: count("ditolak") },
        ]} />
      </div>
      {shown.length === 0 ? <p className={css.muted}>Tidak ada yang cocok dengan saringan ini.</p> : <ul className={css.rows}>
        {shown.map(row => <li key={row.employeeId} className={css.row}>
          <div className={css.rowHead}>
            <span className={css.faceRow}>
              {row.hasPhoto
                // eslint-disable-next-line @next/next/no-img-element -- a five-minute storage address; next/image would cache it
                ? <img className={css.thumb} src={hrAdminApi.facePhoto(row.employeeId, true)} alt="" loading="lazy" />
                : <span className={css.thumb} aria-hidden />}
              <span className={css.who}><strong>{row.name}</strong><span className={css.muted}>{row.department || "Tanpa departemen"} · {row.source === "greatday" ? "Foto GreatDay" : "Daftar sendiri"}{row.consented ? " · sudah setuju" : ""}</span></span>
            </span>
            <Pill tone={tone[row.status]}>{faceStatusLabels[row.status]}</Pill>
          </div>
          {row.note && <p className={css.muted}>{row.note}</p>}
          {refusing === row.employeeId
            ? <div className={css.actions}>
              <label className={`${css.field} ${css.grow}`}>Alasan ditolak<input type="text" maxLength={300} value={note} autoFocus onChange={event => setNote(event.target.value)} placeholder="Mis. foto bukan wajahnya" /></label>
              <ConsoleButton variant="primary" disabled={busy || note.trim().length < 3} onClick={() => void decide(row, "tolak")}>Tolak wajah</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => { setRefusing(null); setNote(""); }}>Batal</ConsoleButton>
            </div>
            : <div className={css.actions}>
              {row.status === "menunggu" && <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy} onClick={() => void decide(row, "setujui")}>Setujui</ConsoleButton>}
              {row.status === "menunggu" && <ConsoleButton icon={<X size={16} aria-hidden />} disabled={busy} onClick={() => setRefusing(row.employeeId)}>Tolak</ConsoleButton>}
              <ConsoleButton icon={<RotateCcw size={16} aria-hidden />} disabled={busy} onClick={() => void decide(row, "reset")}>Minta daftar ulang</ConsoleButton>
            </div>}
        </li>)}
      </ul>}
    </Card>
  </>;
}
