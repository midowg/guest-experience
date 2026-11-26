"use client";

import { useId } from "react";
import { Layer } from "../Layer";
import { useSettled } from "./parts";
import css from "./ga.module.css";

/**
 * Leaving the guest menu book: a question for the GA officer, no PIN (the owner's decision). The
 * safe answer has the focus, and "Ya" ignores the second tap of the press that opened the question.
 */
export function ExitDialog({ count, onStay, onLeave }: { count: number; onStay: () => void; onLeave: () => void }) {
  const titleId = useId();
  const settled = useSettled();
  return (
    <Layer kind="dialog" alert labelledBy={titleId} onClose={onStay} rootClass={css.ga} panelClass={css.askDialog}>
      <h2 id={titleId}>Kembali ke mode GA?</h2>
      <p>{count ? `${count} pilihan tamu dimasukkan ke pesanan. Periksa lalu kirim dari layar GA.` : "Belum ada pilihan tamu."} Khusus petugas GA.</p>
      <div className={css.askFoot}>
        <button type="button" className={css.secondary} data-autofocus onClick={onStay}>Tetap di buku menu</button>
        <button type="button" className={css.primary} onClick={() => { if (settled()) onLeave(); }}>Ya, mode GA</button>
      </div>
    </Layer>
  );
}
