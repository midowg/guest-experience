"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import styles from "@/components/admin/admin.module.css";
import { adminApi } from "@/lib/routes";

/**
 * Deleting takes the guest answers with it and cannot be undone, so the confirmation asks for
 * the event's code (or its slug, before short codes) to be typed rather than a single click.
 * `bare` drops the heading where the page already titles it (the editor's "Hapus acara").
 * `startOpen` goes straight to the typed confirmation (the event list's ⋯ menu), and `onCancel`
 * closes whatever holds it.
 */
export function DeleteEvent({ event, isFeatured, bare = false, startOpen = false, onCancel }: { event: EventRecord; isFeatured: boolean; bare?: boolean; startOpen?: boolean; onCancel?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const word = event.code || event.slug;
  const matches = event.code ? typed.trim().toUpperCase() === event.code : typed.trim() === event.slug;

  async function remove() {
    if (pending || !matches) return;
    setPending(true); setError("");
    try {
      await adminRequest(adminApi(event.id), { method: "DELETE" });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return <section className={styles.danger} aria-labelledby={bare ? undefined : "delete-heading"} aria-label={bare ? "Hapus acara" : undefined}>
    {!bare && <h2 id="delete-heading">Hapus acara</h2>}
    <p>Menghapus acara ini juga menghapus rundown, pertanyaan survei, konfirmasi kehadiran, dan masukan tamu yang sudah masuk. Tindakan ini tidak dapat dibatalkan.</p>

    {isFeatured
      ? <Notice>Acara ini sedang tayang di halaman utama. Hentikan tayangnya dari daftar acara terlebih dahulu sebelum menghapus.</Notice>
      : !open
        ? <Button type="button" variant="danger" onClick={() => setOpen(true)}><Trash2 size={18} aria-hidden="true" /> Hapus acara ini…</Button>
        : <div className="stack" aria-busy={pending}>
          {error && <Notice tone="error">{error}</Notice>}
          <Field
            name="delete-confirm"
            label={`Ketik ${word} untuk mengonfirmasi`}
            hint="Pengetikan ini mencegah penghapusan yang tidak disengaja."
          >
            <input
              id="delete-confirm"
              className="input"
              value={typed}
              autoComplete="off"
              autoFocus={startOpen}
              disabled={pending}
              aria-describedby="delete-confirm-hint"
              onChange={changed => setTyped(changed.target.value)}
              // Inside the editor's form, Enter would save the event instead.
              onKeyDown={key => { if (key.key === "Enter") { key.preventDefault(); void remove(); } }}
            />
          </Field>
          <div className={styles.actions}>
            <Button type="button" variant="danger" disabled={pending || !matches} onClick={remove}>
              <Trash2 size={18} aria-hidden="true" /> {pending ? "Menghapus…" : "Hapus permanen"}
            </Button>
            <Button type="button" variant="quiet" disabled={pending} onClick={() => { setOpen(false); setTyped(""); setError(""); onCancel?.(); }}>Batal</Button>
          </div>
        </div>}
  </section>;
}
