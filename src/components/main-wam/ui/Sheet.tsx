"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cx } from "./Pressable";
import { useModal } from "./useModal";
import css from "./sheet.module.css";

/**
 * Sheet (DS #36): a detail or a short form over the screen, so nothing navigates away. From the
 * bottom on a phone (pull the handle down to close; the ✕ is the button alternative, WCAG 2.5.1),
 * a panel from the right from 1024 px. Focus moves to its title and stays inside; Esc, the ✕, a tap
 * on the dimmed page and the phone's Back button close it, and focus goes back to the opener
 * (useModal). Sheets are always light, also over the dark Momen screens.
 *
 * Control it with `open`/`onClose`. For a sheet with its own address (a link can open it, as
 * Pengaturan#notifikasi in Pra WAM), use useHashSheet and pass `history={false}`.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, history = true, locked = false, initialFocus, closeLabel = "Tutup", flush, className }: {
  open: boolean;
  onClose: () => void;
  /** Heading and spoken name. */
  title: ReactNode;
  /** A line under the title. */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Actions kept in view at the bottom (one primary, block). */
  footer?: ReactNode;
  /** Owns a history entry so Back closes it (default). False when the caller owns the address. */
  history?: boolean;
  /** Busy (saving): stays open; ✕, Esc, Back and the scrim wait. */
  locked?: boolean;
  /** Where focus goes on open; the title when left out. */
  initialFocus?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  /** Body without side padding (a List that runs edge to edge). */
  flush?: boolean;
  className?: string;
}) {
  const { dialogRef, titleRef, onKeyDown, onCancel, onBackdropClick } = useModal({ open, onClose, history, locked, initialFocus });
  const id = useId();
  const inner = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; at: number; dy: number } | null>(null);

  // With the keyboard up, the sheet ends above it (iOS does not shrink dvh for the keyboard).
  useEffect(() => {
    const element = dialogRef.current, viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !element || !viewport) return;
    const fit = () => element.style.setProperty("--mw-vvh", `${Math.round(viewport.height)}px`);
    fit();
    viewport.addEventListener("resize", fit);
    return () => { viewport.removeEventListener("resize", fit); element.style.removeProperty("--mw-vvh"); };
  }, [open, dialogRef]);

  function dragStart(event: ReactPointerEvent<HTMLElement>) {
    if (locked || (event.target as Element).closest("button, a, input") || !window.matchMedia("(max-width: 1023.98px)").matches) return;
    drag.current = { y: event.clientY, at: performance.now(), dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
    if (state.dy > 110 || (state.dy >= 32 && speed > 0.6)) onClose();
  }
  const dragProps = { onPointerDown: dragStart, onPointerMove: dragMove, onPointerUp: dragEnd, onPointerCancel: dragEnd };

  return <dialog ref={dialogRef} className={cx(css.sheet, className)} aria-labelledby={`${id}-title`} aria-describedby={subtitle ? `${id}-sub` : undefined}
    aria-busy={locked || undefined} onKeyDown={onKeyDown} onCancel={onCancel} onClick={onBackdropClick}>
    {open && <div ref={inner} className={css.inner}>
      <div className={css.handle} aria-hidden {...dragProps}><span /></div>
      <header className={css.head} {...dragProps}>
        <div className={css.headText}>
          <h2 ref={titleRef} id={`${id}-title`} tabIndex={-1} className={css.title}>{title}</h2>
          {subtitle && <p id={`${id}-sub`} className={css.subtitle}>{subtitle}</p>}
        </div>
        <button type="button" className={css.close} onClick={onClose} disabled={locked} aria-label={closeLabel}><X aria-hidden /></button>
      </header>
      <div className={cx(css.body, flush && css.bodyFlush)}>{children}</div>
      {footer && <footer className={css.foot}>{footer}</footer>}
    </div>}
  </dialog>;
}

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => { window.removeEventListener("hashchange", onChange); window.removeEventListener("popstate", onChange); };
};
const readHash = () => decodeURIComponent(window.location.hash.slice(1));

/**
 * A sheet with its own address (`#id`), as Pra WAM's Pengaturan rows: a link to `…#id` opens it,
 * Back closes it, a refresh keeps it open. Pass the result to a Sheet with `history={false}`:
 *   const ubah = useHashSheet("ubah-jam");
 *   <Button onClick={ubah.show}>Ubah jam</Button>
 *   <Sheet open={ubah.open} onClose={ubah.close} history={false} title="Ubah jam">…</Sheet>
 */
export function useHashSheet(id: string) {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const open = hash === id;
  const show = useCallback(() => {
    if (readHash() === id) return;
    // Marked, so closing knows this page added the entry and Back is safe.
    window.history.pushState({ ...window.history.state, mwHashSheet: id }, "", `#${encodeURIComponent(id)}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [id]);
  const close = useCallback(() => {
    if (readHash() !== id) return;
    // Opened here: Back. Arrived with the hash (a link): drop it without leaving the screen.
    if (window.history.state?.mwHashSheet === id) window.history.back();
    else {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, [id]);
  return { open, show, close };
}
