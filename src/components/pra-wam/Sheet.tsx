"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import css from "./sheet.module.css";

/*
 * One place for a detail or a form over the page, so nothing navigates away: on a phone a sheet
 * from the bottom, from 1024px a panel that slides in from the side (`side`, right by default).
 * A native <dialog> gives the focus trap and Esc; tapping the dimmed page or the X closes it, and
 * focus goes back to where it was.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  /** The sheet's heading, also its accessible name. */
  title: string;
  /** A line under the title, e.g. the date. */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Buttons kept in view at the bottom (Simpan, Batal…). */
  footer?: ReactNode;
  /** Desktop only: which edge the panel comes from. */
  side?: "right" | "left";
  /** Desktop only: a wider panel for forms with a floor plan. */
  wide?: boolean;
};

export function Sheet({ open, onClose, title, subtitle, children, footer, side = "right", wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const before = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      before.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      before.current?.focus?.();
    }
  }, [open]);

  // Leaving the page with the sheet open must not leave the page locked.
  useEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);

  return <dialog ref={ref} className={`${css.sheet} ${side === "left" ? css.left : ""} ${wide ? css.wide : ""}`} aria-labelledby={`${id}-judul`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    {open && <div className={css.inner}>
      <span className={css.handle} aria-hidden />
      <header className={css.head}>
        <div>
          <h2 id={`${id}-judul`}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className={css.close} onClick={onClose} aria-label="Tutup"><X aria-hidden /></button>
      </header>
      <div className={css.body}>{children}</div>
      {footer && <footer className={css.foot}>{footer}</footer>}
    </div>}
  </dialog>;
}
