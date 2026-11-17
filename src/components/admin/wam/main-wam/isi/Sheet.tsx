"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import css from "./isi.module.css";

/**
 * Tambah and Ubah of the isi acara pages (aturan-wam §9: one sheet with one Simpan): a native
 * <dialog> from the side on a laptop, from the bottom on a phone. The page under it is inert; the
 * focus goes to the title and comes back to the opener; Esc, the dimmed page and ✕ close it
 * (nothing is saved). `busy` keeps it open while saving.
 */
export function Sheet({ title, subtitle, wide = false, busy = false, onClose, onSubmit, footer, children }: {
  title: string; subtitle?: ReactNode; wide?: boolean; busy?: boolean;
  onClose: () => void; onSubmit?: () => void; footer: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal?.();
    heading.current?.focus();
    return () => { if (dialog.open) dialog.close?.(); before?.focus?.(); };
  }, []);

  const submit = (event: FormEvent) => { event.preventDefault(); if (!busyRef.current) onSubmit?.(); };
  return <dialog ref={ref} className={`${css.sheet} ${wide ? css.sheetWide : ""}`} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); if (!busyRef.current) close.current(); }}
    onClick={event => { if (event.target === ref.current && !busyRef.current) close.current(); }}>
    <form className={css.sheetInner} onSubmit={submit} noValidate>
      <header className={css.sheetHead}>
        <div>
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className={css.iconButton} onClick={() => { if (!busyRef.current) close.current(); }} aria-label="Tutup" disabled={busy}><X size={22} aria-hidden /></button>
      </header>
      <div className={css.sheetBody}>{children}</div>
      <footer className={css.sheetFoot}>{footer}</footer>
    </form>
  </dialog>;
}
