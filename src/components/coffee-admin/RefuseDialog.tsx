"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { firstName } from "@/lib/coffee/access";
import { drinkLabel } from "@/lib/coffee/menu";
import type { QueueOrder } from "@/lib/coffee/types";
import { Layer } from "./Layer";
import css from "./coffee-admin.module.css";

export const QUICK_REASONS = ["Minuman sedang habis di mesin.", "Saldo JumpStart sedang habis.", "Pengajuan dobel, sudah diproses."];

/** Tolak: the note is required (the one who ordered reads it); three quick reasons fill it in. */
export function RefuseDialog({ order, onClose, onRefuse }: { order: QueueOrder; onClose: () => void; onRefuse: (note: string) => void }) {
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const text = note.trim();
  const error = !tried ? "" : text.length < 3 ? "Tulis catatan untuk pemesan, minimal 3 huruf." : text.length > 300 ? "Catatan paling panjang 300 huruf." : "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (text.length >= 3 && text.length <= 300) onRefuse(text);
    else field.current?.focus(); // to where the mistake is
  };
  const claim = order.kind === "klaim";
  const item = order.items[0];
  const what = claim ? `klaim ${firstName(order.person.name)}${item ? ` (${drinkLabel(item.slug, item.other)})` : ""}` : `pesanan rapat ${order.room || order.no}`;
  return (
    <Layer onClose={onClose} labelledBy={titleId}>
      <form onSubmit={submit} noValidate>
        <div className={css.dialogHead}>
          <h2 id={titleId}>Tolak {what}?</h2>
          <button type="button" className={css.iconButton} aria-label="Tutup" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        <p className={css.muted}>{claim ? "Jatah tidak terpakai. " : ""}Catatan ini dibaca {claim ? "pemesan" : "GA dan PIC"}.</p>
        <div className={css.field}>
          <label htmlFor={fieldId}>Catatan tolak</label>
          <textarea ref={field} id={fieldId} data-autofocus rows={3} maxLength={300} value={note} onChange={event => setNote(event.target.value)}
            aria-invalid={!!error} aria-describedby={error ? `${fieldId}-error` : undefined} />
          {error && <p id={`${fieldId}-error`} className={css.error} role="alert">{error}</p>}
        </div>
        <div className={css.chips} role="group" aria-label="Catatan cepat">
          {QUICK_REASONS.map(reason => <button key={reason} type="button" onClick={() => setNote(reason)} aria-pressed={note === reason}>{reason}</button>)}
        </div>
        <div className={css.dialogActions}>
          <button type="button" className={css.secondary} onClick={onClose}>Batal</button>
          <button type="submit" className={css.danger}>Tolak</button>
        </div>
      </form>
    </Layer>
  );
}
