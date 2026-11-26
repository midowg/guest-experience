"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { consoleThemeClass } from "@/components/console";
import css from "./coffee-admin.module.css";

/*
 * A dialog, or a panel from the side (a sheet from the bottom on a phone), as the approved
 * prototype has it: Escape closes it, Tab stays inside, the focus goes back to where it came from,
 * the page behind neither scrolls nor can be reached, and on a phone the system's back gesture
 * closes it instead of leaving the page. Layers may stack (a question over a sheet): only the one
 * on top answers.
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

/** The open layers, oldest first: only the last one (the one on top) answers the keyboard and the back gesture. */
const stack: { host: HTMLElement }[] = [];
/** What was made inert behind the layers, to give back exactly that. */
const hushed = new Set<Element>();
let scrollBefore: string | null = null;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Behind the top layer nothing scrolls and nothing can be reached (audit F1-10): the page, and a layer under another layer. */
function settle() {
  const top = stack[stack.length - 1]?.host ?? null;
  for (const element of hushed) { if (element !== top && top) continue; element.removeAttribute("inert"); hushed.delete(element); }
  if (!top) {
    if (scrollBefore !== null) { document.body.style.overflow = scrollBefore; scrollBefore = null; }
    return;
  }
  if (scrollBefore === null) { scrollBefore = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  for (const element of Array.from(document.body.children)) {
    if (element === top || element.hasAttribute("inert")) continue;
    element.setAttribute("inert", "");
    hushed.add(element);
  }
}

/**
 * `onClose`: asked by Escape, a press outside, the X, and the back gesture; the one who opened the
 * layer decides (a form with typed input may ask first). The layer is drawn at the end of the page
 * (a portal), with the console's theme, so everything else can be made inert.
 */
export function Layer({ onClose, labelledBy, side, children }: { onClose: () => void; labelledBy: string; side?: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.coffeeLayer = "true";
    document.body.appendChild(element);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the portal's host exists only in the browser, after the first paint
    setHost(element);
    return () => { element.remove(); };
  }, []);
  useEffect(() => {
    if (!host) return;
    const back = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const entry = { host };
    stack.push(entry);
    settle();
    const onTop = () => stack[stack.length - 1] === entry;
    (root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (!onTop()) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      // Focus that got out comes back in.
      if (!root.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    // On a phone: one history entry while a layer is open, so the back gesture closes it. The entry
    // keeps Next's own state, so the router treats going back as staying on the same page. On a
    // wider screen going back changes the section behind, and the layer closes with it.
    const usesBack = phoneNow();
    const onPop = () => {
      if (!onTop() || window.history.state?.coffeeLayer) return;
      close.current();
      // Still open (it asked first, or another layer is under it): the entry is put back.
      if (usesBack) window.setTimeout(() => { if (stack.length && !window.history.state?.coffeeLayer) window.history.pushState({ ...window.history.state, coffeeLayer: true }, ""); }, 0);
    };
    if (usesBack && !window.history.state?.coffeeLayer) window.history.pushState({ ...window.history.state, coffeeLayer: true }, "");
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      stack.splice(stack.indexOf(entry), 1);
      settle();
      // Deferred, so a remount (React's dev double effect) keeps the entry instead of going back.
      if (usesBack) window.setTimeout(() => { if (stack.length === 0 && window.history.state?.coffeeLayer) window.history.back(); }, 0);
      // Back to where the focus came from; when that is gone (its card left the queue), to the page's main part.
      if (back?.isConnected) back.focus?.();
      else document.querySelector<HTMLElement>("[data-coffee-focus]")?.focus();
    };
  }, [host]);
  if (!host) return null;
  return createPortal(
    <div className={`${css.root} ${consoleThemeClass("admin")}`}>
      <div className={css.scrim} data-side={side ? "true" : undefined} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={panel} className={side ? css.sheet : css.dialog} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>
      </div>
    </div>,
    host,
  );
}
