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
    <p>Halaman utama menampilkan satu acara. Pilih “Tayangkan” pada kartu acara di bawah untuk menggantinya; tautan acara lain tetap aktif.</p>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    <p className={styles.featuredNow}>{current ? <>Sedang tayang: <strong>{current.title}</strong></> : "Belum ada acara di halaman utama."}</p>
    {current && <Button type="button" variant="secondary" disabled={pending} onClick={() => save(null)}>Turunkan dari halaman utama</Button>}
  </section>;
}
