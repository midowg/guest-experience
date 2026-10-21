"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, ImageUp, Trash2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { fitWithin, galleryLimits, galleryStatusLabels, type GalleryPhoto, type GalleryStatus } from "@/lib/gallery";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import styles from "@/components/admin/admin.module.css";
import { adminApi, galleryPath } from "@/lib/routes";

const accept = "image/jpeg,image/png,image/webp,image/heic,image/heif";
type Filter = "all" | GalleryStatus;
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "Semua" }, { key: "pending", label: "Menunggu tinjauan" }, { key: "ready", label: "Tayang" }, { key: "hidden", label: "Disembunyikan" },
];

async function webp(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const size = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") throw new Error("Browser ini belum bisa membuat WebP. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.");
  return blob;
}

/** Display and thumbnail versions are made here, so the server never decodes guest photos. */
async function versions(file: File) {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error(/heic|heif/i.test(file.type) ? "Foto HEIC tidak bisa dibuka di browser ini. Unggah dari Safari, atau ubah ke JPEG dulu." : "Berkas ini tidak bisa dibuka sebagai foto."); }
  try {
    return { width: bitmap.width, height: bitmap.height, large: await webp(bitmap, galleryLimits.largeEdge, 0.85), thumb: await webp(bitmap, galleryLimits.thumbEdge, 0.75) };
  } finally { bitmap.close(); }
}

async function put(url: string, body: Blob, type: string) {
  const response = await fetch(url, { method: "PUT", body, headers: { "Content-Type": type } }).catch(() => null);
  if (!response?.ok) throw new Error("Unggahan ke penyimpanan gagal. Periksa jaringan atau aturan CORS bucket.");
}

/** Upload, review and publish the photos of one event. Guests only see photos marked Tayang. */
export function GalleryManager({ event, initial, configured, migrated }: { event: EventRecord; initial: GalleryPhoto[]; configured: boolean; migrated: boolean }) {
  const [photos, setPhotos] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const base = adminApi(event.id, "gallery");

  if (!configured) return <Notice tone="warning">
    <strong>Penyimpanan foto belum disiapkan.</strong> Galeri memakai Cloudflare R2. Setelah bucket dibuat, isi <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>, <code>R2_SECRET_ACCESS_KEY</code>, dan <code>R2_BUCKET</code> di Vercel, lalu deploy ulang. Langkahnya ada di <code>docs/setup.md</code> bagian Galeri foto.
  </Notice>;
  if (!migrated) return <Notice tone="warning">Galeri menunggu migrasi <code>202610210002_gallery_photos.sql</code>.</Notice>;

  async function upload(files: File[]) {
    setBusy(true); setError(""); setFailures([]);
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      setProgress(`Mengunggah ${index + 1} dari ${files.length}: ${file.name}`);
      try {
        if (file.size > galleryLimits.originalBytes) throw new Error("lebih dari 25 MB");
        const made = await versions(file);
        const type = file.type || "image/jpeg";
        const started = await adminRequest<{ id: string; uploads: { original: string; large: string; thumb: string } }>(base, {
          method: "POST",
          body: JSON.stringify({ original: { type, size: file.size }, large: { size: made.large.size }, thumb: { size: made.thumb.size }, width: made.width, height: made.height }),
        });
        const { id, uploads } = started.data!;
        await Promise.all([put(uploads.original, file, type), put(uploads.large, made.large, "image/webp"), put(uploads.thumb, made.thumb, "image/webp")]);
        const done = await adminRequest<GalleryPhoto>(`${base}/${id}/complete`, { method: "POST", body: "{}" });
        setPhotos(list => [...list, done.data!]);
      } catch (cause) {
        failed.push(`${file.name}: ${cause instanceof Error ? cause.message : errorMessage(cause)}`);
      }
    }
    setFailures(failed);
    setProgress(`${files.length - failed.length} dari ${files.length} foto terunggah dan menunggu tinjauan.`);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function patch(photo: GalleryPhoto, body: Partial<GalleryPhoto>) {
    setError("");
    try {
      const result = await adminRequest<GalleryPhoto>(`${base}/${photo.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setPhotos(list => list.map(item => item.id === photo.id ? result.data! : item));
    } catch (cause) { setError(errorMessage(cause)); }
  }
  async function remove(photo: GalleryPhoto) {
    if (!window.confirm("Hapus foto ini dari galeri dan penyimpanan? Tindakan ini tidak bisa dibatalkan.")) return;
    setError("");
    try { await adminRequest(`${base}/${photo.id}`, { method: "DELETE" }); setPhotos(list => list.filter(item => item.id !== photo.id)); }
    catch (cause) { setError(errorMessage(cause)); }
  }
  async function publishPending() {
    setBusy(true);
    for (const photo of photos.filter(item => item.status === "pending")) await patch(photo, { status: "ready" });
    setBusy(false);
  }

  const shown = photos.filter(photo => filter === "all" ? photo.status !== "uploading" : photo.status === filter);
  const pending = photos.filter(photo => photo.status === "pending").length;
  return <div className="stack">
    <section className={styles.guestCard} aria-labelledby="gallery-upload-title">
      <h2 id="gallery-upload-title" className={styles.guestCardTitle}><ImageUp size={18} aria-hidden="true" /> Unggah foto acara</h2>
      <p className="field-hint">Pilih banyak foto sekaligus (JPEG, PNG, WebP, atau HEIC, maksimal 25 MB per foto). Berkas asli disimpan untuk diunduh tamu; versi tampilan dibuat otomatis. Foto baru menunggu tinjauan dan belum terlihat tamu.</p>
      <label className={styles.galleryPick}>
        <input ref={input} type="file" accept={accept} multiple disabled={busy} onChange={e => { const files = [...(e.target.files ?? [])]; if (files.length) void upload(files); }} />
        <span>{busy ? "Mengunggah…" : "Pilih foto"}</span>
      </label>
      {progress && <p role="status" className={styles.guestMessage}>{progress}</p>}
      {failures.length > 0 && <Notice tone="error"><strong>Belum terunggah:</strong><ul>{failures.map(item => <li key={item}>{item}</li>)}</ul></Notice>}
    </section>

    {error && <Notice tone="error" role="alert">{error}</Notice>}
    <div className={styles.galleryBar}>
      <nav className={styles.galleryFilters} aria-label="Saring foto">
        {filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
          {item.label} ({item.key === "all" ? photos.filter(photo => photo.status !== "uploading").length : photos.filter(photo => photo.status === item.key).length})
        </button>)}
      </nav>
      {pending > 0 && <Button type="button" disabled={busy} onClick={() => void publishPending()}><Eye size={16} aria-hidden="true" /> Tayangkan {pending} foto yang menunggu</Button>}
    </div>

    {shown.length === 0 ? <p>Belum ada foto di sini.</p> : <ul className={styles.galleryGrid}>
      {shown.map(photo => <li key={photo.id} className={styles.galleryItem}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 address, not optimisable */}
        <img src={photo.thumb_url} alt={photo.alt || photo.caption || "Foto acara"} loading="lazy" />
        <span className={styles.galleryStatus} data-status={photo.status}>{galleryStatusLabels[photo.status]}</span>
        <input aria-label="Keterangan foto" placeholder="Keterangan (opsional)" defaultValue={photo.caption} maxLength={300}
          onBlur={e => { if (e.target.value.trim() !== photo.caption) void patch(photo, { caption: e.target.value.trim() }); }} />
        <div className={styles.galleryActions}>
          {photo.status === "ready"
            ? <Button type="button" variant="secondary" onClick={() => void patch(photo, { status: "hidden" })}><EyeOff size={16} aria-hidden="true" /> Sembunyikan</Button>
            : <Button type="button" variant="secondary" onClick={() => void patch(photo, { status: "ready" })}><Eye size={16} aria-hidden="true" /> Tayangkan</Button>}
          <Button type="button" variant="secondary" aria-label="Hapus foto" onClick={() => void remove(photo)}><Trash2 size={16} aria-hidden="true" /></Button>
        </div>
      </li>)}
    </ul>}
    {event.status === "published" && <p className="field-hint">Tamu melihat foto yang tayang di <a href={galleryPath(event)} target="_blank" rel="noopener noreferrer">{galleryPath(event)}</a>.</p>}
  </div>;
}
