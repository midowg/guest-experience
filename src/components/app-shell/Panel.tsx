"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import css from "./app-shell.module.css";

/*
 * A form or a detail over the screen (16 Nov 2026): a panel from the right on a wide screen, a sheet
 * from the bottom on a phone. The screen under it stays as it was (no page load). Esc, the scrim,
 * the close button and the phone's back button all close it.
 */
export function Panel({ open, onClose, title, subtitle, children, footer, label }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** For screen readers when the title is not plain text. */
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pushed = useRef(false);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      if (!element.open) element.showModal();
      // The back button closes the panel instead of leaving the screen.
      if (!pushed.current) { window.history.pushState({ ...window.history.state, appPanel: true }, ""); pushed.current = true; }
    } else {
      if (element.open) element.close();
      if (pushed.current) { pushed.current = false; if (window.history.state?.appPanel) window.history.back(); }
    }
  }, [open]);

  // Removed while open (e.g. remounted with a new key): take its history entry back too.
  useEffect(() => () => { if (pushed.current && window.history.state?.appPanel) { pushed.current = false; window.history.back(); } }, []);

  useEffect(() => {
    if (!open) return;
    const onPop = () => { if (pushed.current) { pushed.current = false; close.current(); } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  return <dialog ref={dialog} className={css.panel} aria-label={label ?? (typeof title === "string" ? title : undefined)}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    {open && <div className={css.panelInner}>
      <div className={css.grab} aria-hidden="true"><span /></div>
      <header className={css.panelHead}>
        <div className={css.panelTitles}><h2 className={css.panelTitle}>{title}</h2>{subtitle && <p className={css.panelSubtitle}>{subtitle}</p>}</div>
        <button type="button" className={css.panelClose} onClick={onClose} aria-label="Tutup"><X size={22} aria-hidden="true" /></button>
      </header>
      <div className={css.panelBody}>{children}</div>
      {footer && <footer className={css.panelFoot}>{footer}</footer>}
    </div>}
  </dialog>;
}

/** A grey block standing in for content that is still loading. */
export function Skeleton({ height = 16, width = "100%", radius = 8 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className={css.skeleton} style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

/** Rows of skeleton for a list. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return <div className={css.skeletonRows} aria-busy="true" aria-label="Memuat">
    {Array.from({ length: rows }, (_, index) => <div key={index} className={css.skeletonRow}>
      <Skeleton width={40} height={40} radius={12} />
      <span className={css.skeletonText}><Skeleton width="60%" height={12} /><Skeleton width="35%" height={10} /></span>
      <Skeleton width={48} height={14} />
    </div>)}
  </div>;
}
