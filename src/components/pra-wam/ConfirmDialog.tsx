"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import styles from "./pra-wam.module.css";

/*
 * One confirmation for every risky action in WAM (HIG / Material): a modal with a clear question,
 * what will happen, the action in its own colour (red for removing), and "Batal". A native
 * <dialog> gives focus trapping and Esc; "Batal" has the focus first (the safe choice), and focus
 * returns to where it was when it closes.
 */

export type ConfirmOptions = {
  /** The question, short: "Hapus permanen?", "Batalkan sesi?". */
  title: string;
  /** What happens, in one or two sentences. */
  body: ReactNode;
  /** The action's own words: "Hapus", "Batalkan sesi", "Kirim". */
  confirmLabel: string;
  /** Removing or anything that cannot be undone: red. */
  danger?: boolean;
  /**
   * Read to the end first (13 Nov 2026, like agreeing to terms): the text scrolls in its box and the
   * action opens only once its end has been seen.
   */
  mustRead?: boolean;
  /** The safe choice's words; "Batal" by default. */
  cancelLabel?: string;
};

function ConfirmDialog({ title, body, confirmLabel, danger, mustRead, cancelLabel = "Batal", onClose }: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const [read, setRead] = useState(!mustRead);
  // Read when its end shows: scrolled there, or short enough to show whole.
  const check = useCallback(() => {
    const element = box.current;
    // Not laid out yet (the dialog opens after this component's first effects): nothing is read.
    if (!element || element.clientHeight === 0) return;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 8) setRead(true);
  }, []);
  // Once the dialog is open and laid out: a short text that shows whole is read at once.
  useEffect(() => {
    if (!mustRead) return;
    const frame = requestAnimationFrame(() => {
      const element = box.current;
      // No layout at all (a test's DOM): nothing to scroll, so it counts as read.
      if (element && element.clientHeight === 0 && element.scrollHeight === 0) setRead(true);
      else check();
    });
    return () => cancelAnimationFrame(frame);
  }, [mustRead, check]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); before?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={`${id}-judul`} aria-describedby={`${id}-isi`}
    onCancel={event => { event.preventDefault(); onClose(false); }}
    onClick={event => { if (event.target === ref.current) onClose(false); }}>
    <div className={styles.dialogBody}>
      <span className={`${styles.tile} ${danger ? styles.tileDanger : ""}`} aria-hidden>{danger ? <AlertTriangle /> : <HelpCircle />}</span>
      <div>
        <h2 id={`${id}-judul`}>{title}</h2>
        {mustRead
          ? <div id={`${id}-isi`} ref={box} className={`${styles.dialogText} ${styles.dialogRead}`} tabIndex={0} onScroll={check}>{body}</div>
          : <div id={`${id}-isi`} className={styles.dialogText}>{body}</div>}
        {!read && <p className={styles.dialogReadHint} role="status">Gulir sampai akhir untuk melanjutkan.</p>}
      </div>
    </div>
    <div className={styles.dialogActions}>
      <button type="button" className="button button--secondary" onClick={() => onClose(false)}>{cancelLabel}</button>
      <button type="button" className={`button button--primary ${danger ? styles.dangerSolid : ""}`} disabled={!read} onClick={() => onClose(true)}>{confirmLabel}</button>
    </div>
  </dialog>;
}

/**
 * `const [confirm, confirmDialog] = useConfirm();` then `if (!(await confirm({...}))) return;`
 * and render `{confirmDialog}` once in the component.
 */
export function useConfirm() {
  const [asked, setAsked] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setAsked({ ...options, resolve })), []);
  const element = asked ? <ConfirmDialog {...asked} onClose={ok => { asked.resolve(ok); setAsked(null); }} /> : null;
  return [confirm, element] as const;
}
