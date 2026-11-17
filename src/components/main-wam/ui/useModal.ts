"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type RefObject, type SyntheticEvent } from "react";

/*
 * What Sheet and ConfirmDialog share: a native <dialog> opened with showModal() (the page under it
 * is inert and the top layer keeps it above everything), plus what the browser does not do on its own:
 * - focus moves in on open (the given element, else the title) and back to the opener on close;
 * - Tab and Shift+Tab wrap inside, so focus never leaves to the address bar;
 * - Esc closes (also the dialog's own close request, e.g. Android's back gesture);
 * - the phone's Back button closes it: while open it owns one history entry ({ mwSheet: id }), and
 *   closing any other way takes that entry back, so Back after closing leaves the screen as usual.
 *   Something inside may push its own entry on top (a photo viewer); going back from it keeps this
 *   one open. Same approach as src/components/app-shell/Panel.tsx (Wellbeing) and SettingsItem (Pra WAM).
 * - the page under it does not scroll while it is open.
 * `locked` (busy: sending) keeps it open: Back puts the entry back, Esc and the scrim do nothing.
 */

const FOCUSABLE = "a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable=\"true\"], [tabindex]:not([tabindex=\"-1\"])";

/** Elements Tab can reach inside `root`, in order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element => !element.closest("[inert], [hidden]") && element.getAttribute("aria-hidden") !== "true");
}

let scrollLocks = 0;
let savedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) { savedOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; }
}
function unlockScroll() {
  if (scrollLocks > 0 && --scrollLocks === 0) document.documentElement.style.overflow = savedOverflow;
}

type Options = {
  open: boolean;
  onClose: () => void;
  /** Own a history entry while open, so Back closes it (default true). */
  history?: boolean;
  locked?: boolean;
  /** Where focus goes on open; the title when left out. */
  initialFocus?: RefObject<HTMLElement | null>;
};

export function useModal({ open, onClose, history = true, locked = false, initialFocus }: Options) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const before = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);
  const pendingBack = useRef<number | undefined>(undefined);
  const marker = useId();
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  useEffect(() => { closeRef.current = onClose; lockedRef.current = locked; });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
        lockScroll();
        const target = initialFocus?.current ?? titleRef.current ?? focusables(dialog)[0];
        target?.focus({ preventScroll: true });
      }
      if (history && !pushed.current) {
        window.history.pushState({ ...window.history.state, mwSheet: marker }, "");
        pushed.current = true;
      }
    } else {
      if (dialog.open) {
        dialog.close();
        unlockScroll();
        const opener = before.current;
        before.current = null;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      }
      if (pushed.current) {
        pushed.current = false;
        if (window.history.state?.mwSheet === marker) window.history.back();
      }
    }
  }, [open, history, marker, initialFocus]);

  // Removed while open: close, and take the history entry back a moment later. Cancelled when it is
  // set up again at once (React's development double run), so a sheet that mounts open stays open.
  useEffect(() => {
    window.clearTimeout(pendingBack.current);
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) { dialog.close(); unlockScroll(); }
      if (!pushed.current) return;
      pendingBack.current = window.setTimeout(() => {
        if (pushed.current && window.history.state?.mwSheet === marker) { pushed.current = false; window.history.back(); }
      }, 0);
    };
  }, [marker]);

  useEffect(() => {
    if (!open || !history) return;
    const onPop = () => {
      if (!pushed.current) return;
      // Back from something inside, whose entry sat on top of ours: still open.
      if (window.history.state?.mwSheet === marker) return;
      if (lockedRef.current) { window.history.pushState({ ...window.history.state, mwSheet: marker }, ""); return; }
      pushed.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, history, marker]);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event.key === "Escape") {
      // Only the top dialog answers.
      event.preventDefault();
      event.stopPropagation();
      if (!lockedRef.current) closeRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(dialog);
    if (items.length === 0) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !active || !dialog.contains(active) || !items.includes(active as HTMLElement);
    if (event.shiftKey && (active === first || outside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || (outside && active !== titleRef.current))) { event.preventDefault(); first.focus(); }
  }

  /** The dialog's own close request (Esc in some browsers, Android back gesture). */
  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!lockedRef.current) closeRef.current();
  }

  /** A tap on the dimmed page (the dialog's backdrop) closes it. */
  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !lockedRef.current) closeRef.current();
  }

  return { dialogRef, titleRef, onKeyDown, onCancel, onBackdropClick };
}
