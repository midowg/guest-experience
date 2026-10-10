"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "./api";
import styles from "./admin.module.css";

/** Chooses which published event the bare domain shows. Drafts cannot be selected. */
export function FeaturedControl({ events, featuredId }: { events: EventRecord[]; featuredId: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const published = events.filter(event => event.status === "published");
  const current = events.find(event => event.id === featuredId) ?? null;

  async function save(eventId: string | null) {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ eventId: string | null }>("/api/admin/featured", { method: "PUT", body: JSON.stringify({ eventId }) });
      setMessage(result.message);
      router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }

  return <section className={styles.featured} aria-labelledby="featured-heading" aria-busy={pending}>
    <h2 id="featured-heading">Tayang di halaman utama</h2>
    <p>Tamu yang membuka alamat utama akan melihat acara yang dipilih di sini, tanpa perlu nama acara pada tautan. Acara tetap tayang sampai Anda menghentikannya; jadwal acara tidak menurunkannya secara otomatis.</p>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    {published.length === 0
      ? <Notice>Belum ada acara yang dipublikasikan. Publikasikan acara terlebih dahulu sebelum menayangkannya di halaman utama.</Notice>
      : <>
        <p className={styles.featuredNow}>{current ? <>Sedang tayang: <strong>{current.title}</strong></> : "Halaman utama belum menayangkan acara apa pun."}</p>
        <ul className={styles.featuredList}>
          {published.map(event => <li key={event.id}>
            <span>{event.title}</span>
            {event.id === featuredId
              ? <span className={styles.status}>Sedang tayang</span>
              : <Button type="button" variant="secondary" disabled={pending} onClick={() => save(event.id)}>Tayangkan ini</Button>}
          </li>)}
        </ul>
        {current && <div className="stack">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => save(null)}>Turunkan dari halaman utama</Button>
          <p className="muted">Setelah diturunkan, halaman utama menampilkan sambutan tanpa detail acara. Acara dan jawaban tamu tidak terhapus, dan tautan <code>/e/{current.slug}</code> tetap dapat dibuka.</p>
        </div>}
      </>}
  </section>;
}
