"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import css from "./coffee.module.css";

/*
 * A sheet from the bottom, or a question in the middle, as the approved prototype has them. The
 * same rules as the pengelola's Layer (coffee-admin/Layer.tsx, after its audit), in the employee
 * app's own look: Escape closes it, Tab stays inside, the focus goes back to where it came from
 * (or to the screen when that is gone), the page behind neither scrolls nor can be reached, and on
 * a phone the system's back gesture closes it instead of leaving the page. Layers may stack: only
 * the one on top answers.
 */

const PHONE = "(max-width: 760px)";
const phoneNow = () => typeof window !== "undefined" && !!window.matchMedia?.(PHONE).matches;

const stack: { host: HTMLElement }[] = [];
const hushed = new Set<Element>();
let scrollBefore: string | null = null;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

/** True while a layer's own history entry is the current one (the tab bar then replaces it instead of adding one). */
export const onLayerEntry = () => typeof window !== "undefined" && !!window.history.state?.coffeeLayer;

/**
 * `onClose`: asked by Escape, a press outside, the X, and the back gesture; the one who opened the
 * layer decides (a claim being sent stays open). `kind`: a sheet from the bottom, or a question.
 * `rootClass` and `panelClass`: another look for the same layer (the GA tablet adds its own).
 */
export function Layer({ onClose, labelledBy, kind = "sheet", alert, rootClass, panelClass, children }: {
  onClose: () => void; labelledBy: string; kind?: "sheet" | "dialog"; alert?: boolean; rootClass?: string; panelClass?: string; children: ReactNode;
}) {
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
      if (!root.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    // On a phone: one history entry while a layer is open, so the back gesture closes it.
    const usesBack = phoneNow();
    const onPop = () => {
      if (!onTop() || window.history.state?.coffeeLayer) return;
      close.current();
      // Still open (a claim is being sent, or another layer is under it): the entry is put back.
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
      // Back to where the focus came from; when that is gone (the screen changed), to the screen itself.
      if (back?.isConnected) back.focus?.();
      else document.querySelector<HTMLElement>("[data-coffee-focus]")?.focus();
    };
  }, [host]);
  if (!host) return null;
  return createPortal(
    <div className={`${css.theme} ${css.layerRoot}${rootClass ? ` ${rootClass}` : ""}`}>
      <div className={css.scrim} data-center={kind === "dialog" ? "true" : undefined} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={panel} className={`${kind === "dialog" ? css.dialog : css.sheet}${panelClass ? ` ${panelClass}` : ""}`} role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={labelledBy}>{children}</div>
      </div>
    </div>,
    host,
  );
}
