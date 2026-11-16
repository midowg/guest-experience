"use client";

import { useEffect, useRef, type FocusEvent as ReactFocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import css from "./app-shell.module.css";

/*
 * A form or a detail over the screen (16 Nov 2026): a panel from the right on a wide screen, a sheet
 * from the bottom on a phone. The screen under it stays as it was (no page load). Esc, the scrim,
 * the close button and the phone's back button all close it; on a phone the sheet can also be
 * pulled down by its handle.
 *
 * 17 Nov 2026, for phone-first apps (Wellbeing): `variant="sheet"` is a bottom sheet on a phone and
 * a centred card on a wide screen (never a side panel), sized to the visible viewport so the
 * keyboard never covers the field or the footer; `tall` gives it the full height, `onBack` puts a
 * back arrow before the title (steps inside one sheet), `focusKey` moves focus to the title when it
 * changes (a new step is announced), `locked` keeps it open (Back, Esc, scrim) while it works.
 * Something inside may push its own history entry (a photo viewer); going back from it leaves the
 * panel open.
 */
export function Panel({ open, onClose, title, subtitle, children, footer, label, variant = "auto", tall = false, onBack, backLabel = "Kembali", className, locked = false, focusKey }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** For screen readers when the title is not plain text. */
  label?: string;
  /** "auto": side panel on wide screens, sheet on phones. "sheet": sheet on phones, centred card on wide screens. */
  variant?: "auto" | "sheet";
  /** Full height (a form with steps), instead of as tall as its content. */
  tall?: boolean;
  /** Shows a back arrow before the title. */
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  /** Busy (uploading, signing out): Back, Esc, the scrim and the buttons do not close it. */
  locked?: boolean;
  /** When this changes while open, focus moves to the title. */
  focusKey?: string | number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const pendingBack = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const drag = useRef<{ y: number; at: number; dy: number } | null>(null);
  const close = useRef(onClose);
  const lockedNow = useRef(locked);
  useEffect(() => { close.current = onClose; lockedNow.current = locked; });

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

  // Removed while open (e.g. remounted with a new key): take its history entry back too. Done a
  // moment later and cancelled if the panel is set up again at once (React's dev double run), so
  // a panel that mounts open does not close itself.
  useEffect(() => {
    clearTimeout(pendingBack.current);
    return () => {
      if (!pushed.current) return;
      pendingBack.current = setTimeout(() => {
        if (pushed.current && window.history.state?.appPanel) { pushed.current = false; window.history.back(); }
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      if (!pushed.current) return;
      // Back from something inside (its entry sat on top of ours): we are still here.
      if (window.history.state?.appPanel) return;
      // Busy: put our entry back instead of closing.
      if (lockedNow.current) { window.history.pushState({ ...window.history.state, appPanel: true }, ""); return; }
      pushed.current = false;
      close.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  // A sheet follows the visible viewport: with the keyboard up it ends above the keyboard.
  useEffect(() => {
    const element = dialog.current, viewport = window.visualViewport;
    if (!open || variant !== "sheet" || !element || !viewport) return;
    const fit = () => {
      element.style.setProperty("--ap-vvh", `${Math.round(viewport.height)}px`);
      element.style.setProperty("--ap-kb", `${Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height))}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      element.style.removeProperty("--ap-vvh");
      element.style.removeProperty("--ap-kb");
    };
  }, [open, variant]);

  // A new step: focus its title, so a screen reader says where we are.
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [focusKey, open]);

  // The field being typed in stays in view once the keyboard has opened.
  function onFocusIn(event: ReactFocusEvent<HTMLDialogElement>) {
    const target = event.target as HTMLElement;
    if (variant !== "sheet" || !target.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select")) return;
    setTimeout(() => target.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300);
  }

  // Pull a sheet down by its handle or header to close it (phones only).
  function dragStart(event: ReactPointerEvent<HTMLElement>) {
    if (variant !== "sheet" || locked || (event.target as Element).closest("button, a, input") || !window.matchMedia("(max-width: 47.99rem)").matches) return;
    drag.current = { y: event.clientY, at: performance.now(), dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (inner.current) inner.current.style.transition = "none";
  }
  function dragMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current || !inner.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.y);
    inner.current.style.transform = `translateY(${drag.current.dy}px)`;
  }
  function dragEnd(event: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state || !inner.current) return;
    inner.current.style.transition = "";
    inner.current.style.transform = "";
    if (event.type === "pointercancel") return;
    const speed = state.dy / Math.max(1, performance.now() - state.at);
    if (state.dy > 110 || (state.dy >= 32 && speed > 0.6)) close.current();
  }

  const classes = [css.panel, variant === "sheet" ? css.sheet : "", tall ? css.tall : "", className ?? ""].filter(Boolean).join(" ");
  return <dialog ref={dialog} className={classes} aria-label={label ?? (typeof title === "string" && title ? title : undefined)} aria-busy={locked || undefined}
    onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}
    onClick={event => { if (event.target === dialog.current && !locked) onClose(); }}
    onFocus={onFocusIn}>
    {open && <div ref={inner} className={css.panelInner}>
      <div className={css.grab} aria-hidden="true" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}><span /></div>
      <header className={css.panelHead} onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        {onBack && <button type="button" className={css.panelClose} onClick={onBack} disabled={locked} aria-label={backLabel}><ArrowLeft size={22} aria-hidden="true" /></button>}
        <div className={css.panelTitles}><h2 ref={titleRef} tabIndex={-1} className={css.panelTitle}>{title}</h2>{subtitle && <p className={css.panelSubtitle}>{subtitle}</p>}</div>
        <button type="button" className={css.panelClose} onClick={onClose} disabled={locked} aria-label="Tutup"><X size={22} aria-hidden="true" /></button>
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
