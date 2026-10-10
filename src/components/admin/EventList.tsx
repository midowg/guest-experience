"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Notice } from "@/components/ui";
import type { EventRecord, EventStatus } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";
import { adminRequest, errorMessage } from "./api";
import styles from "./admin.module.css";

const statuses: Record<EventStatus, string> = { draft: "Draft", published: "Publik via tautan", archived: "Diarsipkan" };
export function EventList({ events, featuredId }: { events: EventRecord[]; featuredId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [featured, setFeatured] = useState(featuredId);
  async function feature(event: EventRecord) {
    if (busy || event.status !== "published" || featured === event.id) return;
    const current = events.find(item => item.id === featured);
    if (!window.confirm(current ? `Tayangkan “${event.title}” di halaman utama menggantikan “${current.title}”? Tautan acara lama tetap aktif.` : `Tayangkan “${event.title}” di halaman utama?`)) return;
    setBusy(event.id); setError("");
    try {
      await adminRequest<{ eventId: string }>("/api/admin/featured", { method: "PUT", body: JSON.stringify({ eventId: event.id }) });
      setFeatured(event.id); router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function create(duplicateId?: string) {
    if (busy) return;
    setBusy(duplicateId || "new"); setError("");
    try {
      const result = await adminRequest<EventRecord>("/api/admin/events", { method: "POST", body: JSON.stringify(duplicateId ? { duplicateId } : {}) });
      if (!result.data) throw new Error("Missing event");
      router.push(`/admin/events/${result.data.id}`); router.refresh();
    } catch (err) { setError(errorMessage(err)); setBusy(null); }
  }
  return <div className="stack" aria-busy={!!busy}>
    <div className={styles.itemHeader}><p>{events.length} acara. Duplikasi hanya menyalin konten sebagai draft, bukan jawaban tamu.</p><Button type="button" disabled={!!busy} onClick={() => create()}>{busy === "new" ? "Membuat draft…" : "Buat acara"}</Button></div>
    {error && <Notice tone="error">{error} <a href="/admin/login">Halaman masuk</a></Notice>}
    {!events.length ? <Notice>Belum ada acara. Buat draft pertama untuk meninjau dan menyunting konten sebelum publikasi.</Notice> : <ul className={styles.eventList}>
      {events.map(event => <li key={event.id} className={styles.eventCard}>
        {event.id === featured && event.status === "published" ? <span className={`${styles.status} ${styles.statusLive}`}><span className={styles.statusDot} aria-hidden="true" />Tayang di halaman utama</span> : <span className={styles.status}>{statuses[event.status]}</span>}
        <h2>{event.title}</h2>
        <p className={styles.eventWhen}>{formatDate(event.starts_at)} · {formatTime(event.starts_at)} WIB</p>
        <p className={styles.eventSlug}>/e/{event.slug}</p>
        {/* Housekeeping dates sit below a rule: useful for choosing between events, but
            never competing with the event's own date. */}
        <dl className={styles.eventMeta}>
          <div><dt>Dibuat</dt><dd>{formatDate(event.created_at)}</dd></div>
          <div><dt>Terakhir disimpan</dt><dd>{formatDate(event.updated_at)}, {formatTime(event.updated_at)} WIB</dd></div>
        </dl>
        <div className={styles.actions}><ButtonLink href={`/admin/events/${event.id}`}>Kelola acara</ButtonLink>{event.status === "published" && event.id !== featured && <Button type="button" variant="secondary" disabled={!!busy} onClick={() => feature(event)}>{busy === event.id ? "Menayangkan…" : "Tayangkan"}</Button>}<Button type="button" variant="secondary" disabled={!!busy} onClick={() => create(event.id)}>{busy === event.id ? "Menduplikasi…" : "Duplikasi ke draft"}</Button></div>
      </li>)}
    </ul>}
  </div>;
}
