"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import css from "./coffee-admin.module.css";

/*
 * A dialog, or a panel from the side (a sheet from the bottom on a phone), as the approved
 * prototype has it: Escape closes it, Tab stays inside, the focus goes back to where it came from,
 * and on a phone the system's back gesture closes it instead of leaving the page.
 */

/** Phone layout; coffee-admin.module.css uses the same breakpoint. */
export const PHONE = "(max-width: 760px)";
const phoneNow = () => typeof window !== "undefined" && !!window.matchMedia?.(PHONE).matches;
function subscribePhone(listener: () => void) {
  const query = window.matchMedia?.(PHONE);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}
/** True on a phone-sized screen (false while the server draws the page). */
export const usePhone = (): boolean => useSyncExternalStore(subscribePhone, phoneNow, () => false);

/** Open layers that hold a history entry (the phone's back gesture). */
let openLayers = 0;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Layer({ onClose, labelledBy, side, children }: { onClose: () => void; labelledBy: string; side?: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const root = panel.current;
    (root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    // One history entry while it is open, so the back gesture closes it. The entry keeps Next's own
    // state, so the router treats going back as staying on the same page.
    const usesBack = phoneNow();
    const onPop = () => { if (!window.history.state?.coffeeLayer) close.current(); };
    if (usesBack) {
      openLayers += 1;
      if (!window.history.state?.coffeeLayer) window.history.pushState({ ...window.history.state, coffeeLayer: true }, "");
      window.addEventListener("popstate", onPop);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      if (usesBack) {
        openLayers -= 1;
        window.removeEventListener("popstate", onPop);
        // Deferred, so a remount (React's dev double effect) keeps the entry instead of going back.
        window.setTimeout(() => { if (openLayers === 0 && window.history.state?.coffeeLayer) window.history.back(); }, 0);
      }
      back?.focus?.();
    };
  }, []);
  return (
    <div className={css.scrim} data-side={side ? "true" : undefined} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className={side ? css.sheet : css.dialog} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>
    </div>
  );
}
