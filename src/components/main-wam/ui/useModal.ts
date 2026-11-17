"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type RefObject, type SyntheticEvent } from "react";

/*
 * What Sheet and ConfirmDialog share: a native <dialog> opened with showModal() (the page under it
 * is inert and the top layer keeps it above everything), plus what the browser does not do on its own:
 * - focus moves in on open (the given element, else the title) and back to the opener on close;
 *   after a tap it moves without a ring (quietFocus), after a key press with one;
 * - Tab and Shift+Tab wrap inside, so focus never leaves to the address bar;
 * - Esc closes (also the dialog's own close request, e.g. Android's back gesture);
 * - the phone's Back button closes it: while open it owns one history entry (modalHistory below), and
 *   closing any other way takes that entry back, so Back after closing leaves the screen as usual.
 *   Something inside may push its own entry on top (a photo viewer); going back from it keeps this
 *   one open.
 * - the page under it does not scroll while it is open.
 * `locked` (busy: sending) keeps it open: Back puts the entry back, Esc and the scrim do nothing.
 */

const FOCUSABLE = "a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable=\"true\"], [tabindex]:not([tabindex=\"-1\"])";

/**
 * Elements Tab can reach inside `root`, in order. A button or link taken out of the Tab order
 * (tabindex -1: the unchosen radios of a roving group) is not one, or Tab from the last real stop
 * would slip out to the page (T-M01).
 */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(element => element.getAttribute("tabindex") !== "-1" && !element.closest("[inert], [hidden]") && element.getAttribute("aria-hidden") !== "true");
}

let scrollLocks = 0;
let savedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) { savedOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; }
}
function unlockScroll() {
  if (scrollLocks > 0 && --scrollLocks === 0) document.documentElement.style.overflow = savedOverflow;
}

/* ---------- Focus without a ring after a tap ---------- */

// Whether the last thing the person did was a key press (true) or a tap/click (false). Browsers
// guess this for :focus-visible, but a script moving focus (a dialog opening on Batal, or one that is
// open when the page loads) can show the ring after a tap. Tracked from the first modal on the page.
let keyboardLast = false;
let tracking = false;
function trackModality() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("keydown", event => { if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboardLast = true; }, true);
  const pointer = () => { keyboardLast = false; };
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("mousedown", pointer, true);
}

/** The attribute that hides the ring of an element focused by script after a tap (theme.module.css). */
export const QUIET_FOCUS = "data-mw-quiet-focus";

/**
 * Moves focus to `element` the way the person got here: with the ring after a key press, without it
 * after a tap. The ring comes back as soon as a key is pressed on it, and the mark goes on blur.
 */
export function quietFocus(element: HTMLElement) {
  if (keyboardLast) { element.focus({ preventScroll: true }); return; }
  element.setAttribute(QUIET_FOCUS, "");
  const clear = () => { element.removeAttribute(QUIET_FOCUS); element.removeEventListener("blur", clear); element.removeEventListener("keydown", clear); };
  element.addEventListener("blur", clear);
  element.addEventListener("keydown", clear);
  element.focus({ preventScroll: true });
  if (document.activeElement !== element) clear();
}

/* ---------- History: one entry per open modal, shared by every Sheet and ConfirmDialog ---------- */

type Holder = { close: () => void; locked: () => boolean };
/** One entry this page pushed for a modal. `holder` null = its modal closed but the entry is still there. */
type Entry = { key: string; holder: Holder | null };

/**
 * The phone's Back button closes the top modal, so each open modal owns one history entry
 * (`{ mwSheet: key }`). history.back() is asynchronous: its popstate comes after whatever the page
 * does next. Each modal used to take its own entry back and read popstate on its own, so closing one
 * and opening the next straight away (a menu → Pindah tempat) let the late popstate close the new
 * one, or left an entry behind. All modals now go through this one queue:
 * - an entry knows its owner (`key`), so a popstate closes only the modals whose entries were left;
 * - closing takes the entry back a moment later (a timer). A modal that opens before that takes the
 *   entry over instead (no history step at all); one that opens while a step is on its way waits for
 *   it and pushes after it;
 * - entries that could not be taken back (something else was on top: the person went to another
 *   page while a sheet was open) are skipped when Back reaches them, so Back never "does nothing".
 */
const modalHistory = (() => {
  const entries: Entry[] = [];            // bottom → top, the same order as in the browser's history
  const waiting: { holder: Holder }[] = [];
  let backs = 0;                           // our own history steps whose popstate has not come yet
  let backsTimer: number | undefined;
  let trimTimer: number | undefined;
  let seq = 0;
  let listening = false;

  const keyNow = (): string | undefined => {
    const state = window.history.state as { mwSheet?: unknown } | null;
    return typeof state?.mwSheet === "string" ? state.mwSheet : undefined;
  };
  const push = (entry: Entry) => {
    window.history.pushState({ ...window.history.state, mwSheet: entry.key }, "");
    entries.push(entry);
  };
  const step = (delta: number) => {
    backs += 1;
    window.clearTimeout(backsTimer);
    // A step that never reports back (the browser dropped it) must not hold the queue forever.
    backsTimer = window.setTimeout(() => { backs = 0; settle(); }, 1000);
    window.history.go(-delta);
  };

  /** Takes back the closed entries on top, in one step, when they are what the browser shows. */
  const trim = () => {
    trimTimer = undefined;
    if (backs > 0) return;
    let count = 0;
    while (count < entries.length && entries[entries.length - 1 - count].holder === null) count += 1;
    if (count === 0) return;
    // Something else sits on top (a page the person went to, a viewer without our key): leave them;
    // Back skips them when it gets there.
    if (keyNow() !== entries[entries.length - 1].key) return;
    entries.splice(entries.length - count, count);
    step(count);
  };
  const scheduleTrim = () => { if (trimTimer === undefined) trimTimer = window.setTimeout(trim, 0); };

  /** After a step landed: drop closed entries, then push the modals that waited for it. */
  const settle = () => {
    trim();
    if (backs > 0) return;
    while (waiting.length) push({ key: `mw${++seq}`, holder: waiting.shift()!.holder });
  };

  const onPop = () => {
    const ours = backs > 0;
    if (ours) { backs -= 1; if (backs === 0) window.clearTimeout(backsTimer); }
    // Where the browser is now. Not one of ours (the page itself, or an entry from before a reload,
    // which is the page now and must not be stepped past): below all of them.
    const at = keyNow();
    const index = at === undefined ? -1 : entries.findIndex(entry => entry.key === at);
    // Entries above that were left by Back: their modals close, top first.
    const left = entries.splice(index + 1);
    const open = left.filter(entry => entry.holder);
    if (open.some(entry => entry.holder!.locked())) {
      // Busy: stays open, and its entry goes back so the next Back still finds it.
      for (const entry of open) push(entry);
    } else {
      for (const entry of open.reverse()) entry.holder!.close();
    }
    // Landed on an entry whose modal already closed: trim steps past it.
    settle();
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    window.addEventListener("popstate", onPop);
  };

  return {
    /** A modal opened: give it an entry (or the one a modal just closed left behind). */
    claim(holder: Holder): object {
      listen();
      const ticket = { holder };
      if (backs > 0) { waiting.push(ticket); return ticket; }
      const top = entries[entries.length - 1];
      if (top && top.holder === null && keyNow() === top.key) { top.holder = holder; return ticket; }
      push({ key: `mw${++seq}`, holder });
      return ticket;
    },
    /** A modal closed (✕, Esc, its parent, removed): its entry goes back a moment later. */
    release(ticket: object) {
      const queued = waiting.findIndex(item => item === ticket);
      if (queued >= 0) { waiting.splice(queued, 1); return; }
      const entry = entries.find(item => item.holder === (ticket as { holder: Holder }).holder);
      if (!entry) return;
      entry.holder = null;
      scheduleTrim();
    },
  };
})();

/* ---------- Focus handed from a closing modal to the next one ---------- */

type Opened = { dialog: HTMLDialogElement; before: HTMLElement | null };
const opened: Opened[] = [];
const usable = (element: HTMLElement | null): element is HTMLElement =>
  !!element && element.isConnected && element !== document.body && !element.closest("dialog:not([open])");
function forget(entry: Opened | null) {
  const index = entry ? opened.indexOf(entry) : -1;
  if (index >= 0) opened.splice(index, 1);
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
  const record = useRef<Opened | null>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  useEffect(() => { closeRef.current = onClose; lockedRef.current = locked; });
  useEffect(trackModality, []);

  // Show and hide the dialog; focus in on open, back to the opener on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const entry: Opened = { dialog, before: active };
      record.current = entry;
      opened.push(entry);
      try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
      lockScroll();
      const target = initialFocus?.current ?? titleRef.current ?? focusables(dialog)[0];
      if (target) quietFocus(target);
    } else if (!open && dialog.open) {
      const active = document.activeElement;
      // Focus stayed here (or went to the page when the content went): it goes back to the opener.
      // When the next modal already took it (closed and opened at once), that one gets the opener.
      const focusHere = !active || active === document.body || dialog.contains(active);
      dialog.close();
      unlockScroll();
      const entry = record.current;
      record.current = null;
      forget(entry);
      const opener = entry?.before ?? null;
      if (focusHere) { if (usable(opener)) quietFocus(opener); }
      else {
        const next = opened[opened.length - 1];
        if (next && !usable(next.before)) next.before = opener;
      }
    }
  }, [open, initialFocus]);

  // Removed while open (a sheet rendered only while open, or the page changing): close, and when
  // focus went with it and the opener is still on the page, back to the opener (T-K01). When the
  // page changed, the opener is gone too and focus is left to the new page.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (!dialog?.open) return;
      const active = document.activeElement;
      const focusHere = !active || active === document.body || dialog.contains(active);
      dialog.close();
      unlockScroll();
      const entry = record.current;
      forget(entry);
      record.current = null;
      if (focusHere && usable(entry?.before ?? null)) quietFocus(entry!.before!);
    };
  }, []);

  // The history entry, for as long as it is open (also when it is removed while open).
  useEffect(() => {
    if (!open || !history) return;
    const ticket = modalHistory.claim({ close: () => closeRef.current(), locked: () => lockedRef.current });
    return () => modalHistory.release(ticket);
  }, [open, history]);

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
