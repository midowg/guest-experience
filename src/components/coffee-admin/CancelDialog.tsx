"use client";

import { useId } from "react";
import { X } from "lucide-react";
import type { CancelTarget } from "./api";
import { Layer } from "./Layer";
import css from "./coffee-admin.module.css";

/**
 * Batalkan catatan: asks first. Only for a record made by hand (Catat manual) that turned out
 * wrong; it stays in Rekap as "Dibatalkan" and, for a claim, the person's quota comes back.
 */
export function CancelDialog({ target, onClose, onConfirm }: { target: CancelTarget; onClose: () => void; onConfirm: () => void }) {
  const titleId = useId();
  return (
    <Layer onClose={onClose} labelledBy={titleId}>
      <form onSubmit={event => { event.preventDefault(); onConfirm(); }}>
        <div className={css.dialogHead}>
          <h2 id={titleId}>Batalkan catatan manual ini?</h2>
          <button type="button" className={css.iconButton} aria-label="Tutup" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        <p><strong>{target.title}</strong></p>
        <p className={css.muted}>{target.claim ? "Jatah orangnya dikembalikan. " : ""}Catatan tetap ada di Rekap sebagai Dibatalkan dan tidak dihitung lagi.</p>
        <div className={css.dialogActions}>
          <button type="button" className={css.secondary} data-autofocus onClick={onClose}>Kembali</button>
          <button type="submit" className={css.danger}>Batalkan catatan</button>
        </div>
      </form>
    </Layer>
  );
}
