"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { EventExperience } from "@/components/guest/EventExperience";
import { GuidePage } from "@/components/guest/GuidePage";
import { PlaceGuide } from "@/components/guest/PlaceGuide";
import { VISIT_AREA_EVENT } from "@/components/guest/VisitExperience";
import { donationTotals } from "@/lib/donations";
import { prepareEvent } from "@/components/admin/editor/editor-model";
import { normalizeEvent } from "@/lib/hero-framing";
import { isPreviewMessage, type PreviewArea, type PreviewMessage } from "@/lib/live-preview";
import type { EventPhase, EventRecord } from "@/lib/types";

/** A half-typed field must not blank the preview for good: the next update tries again. */
class Boundary extends Component<{ children: ReactNode; attempt: number }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { attempt: number }) {
    if (this.state.failed && previous.attempt !== this.props.attempt) this.setState({ failed: false });
  }
  render() {
    return this.state.failed
      ? <p style={{ padding: 24, fontFamily: "var(--font-body)", color: "#5b6476" }}>Pratinjau tampil lagi setelah isian lengkap.</p>
      : this.props.children;
  }
}

/** The element that shows a part of the guest page. */
const elementOf = (area: PreviewArea): Element | null => area === "hero" ? document.querySelector("[data-invitation-hero]") : area === "day" ? document.querySelector("[data-today-panel]") : area === "after" ? document.querySelector("[data-after-panel]") : document.getElementById(area);
const HIGHLIGHT = "data-preview-highlight";

const areaOf = (target: Element): PreviewArea | null => {
  if (target.closest("[data-invitation-hero]")) return "hero";
  if (target.closest("[data-today-panel]")) return "day";
  if (target.closest("[data-after-panel]")) return "after";
  const section = target.closest("main section[id]");
  return (section?.id as PreviewArea | undefined) ?? null;
};

/**
 * The editor's phone preview. The draft arrives by postMessage from the editor in the parent
 * window and renders with the real guest components at a real phone width. Tapping a part tells
 * the editor which block to open; links never leave the preview.
 */
export function LivePreviewFrame() {
  const [draft, setDraft] = useState<{ event: EventRecord; phase: EventPhase; guest?: string; version: number } | null>(null);
  const [highlight, setHighlight] = useState<{ area: PreviewArea; label: string; field?: string } | null>(null);
  useEffect(() => {
    const send = (message: PreviewMessage) => parent.postMessage(message, location.origin);
    const receive = (message: MessageEvent) => {
      if (message.origin !== location.origin || message.source !== parent || parent === window || !isPreviewMessage(message.data)) return;
      const data = message.data;
      if (data.type === "preview:update") setDraft(current => ({ event: normalizeEvent(prepareEvent(data.event)), phase: data.phase, guest: data.guest, version: (current?.version ?? 0) + 1 }));
      if (data.type === "preview:highlight") setHighlight(data.area ? { area: data.area, label: data.label ?? "", field: data.field } : null);
      if (data.type === "preview:scroll") {
        // An office visit shows one screen at a time: switch to the part's screen first.
        window.dispatchEvent(new CustomEvent(VISIT_AREA_EVENT, { detail: data.area }));
        requestAnimationFrame(() => {
          const target = elementOf(data.area);
          // scrollIntoView would also scroll the editor page around the frame; move this window only.
          if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 8, behavior: "smooth" });
        });
      }
    };
    const click = (e: MouseEvent) => {
      const target = e.target as Element;
      const link = target.closest("a[href]");
      // Leaving for WhatsApp, Maps or a calendar file would take the editor's preview with it.
      if (link && !link.getAttribute("href")!.startsWith("#")) e.preventDefault();
      // A visit's tabs and tiles only move between screens; they open no block in the editor.
      if (link && target.closest("[data-visit-nav]")) return;
      const area = areaOf(target);
      if (area) send({ type: "preview:focus", area });
    };
    window.addEventListener("message", receive);
    document.addEventListener("click", click, true);
    send({ type: "preview:ready" });
    return () => { window.removeEventListener("message", receive); document.removeEventListener("click", click, true); };
  }, []);
  // The frame is an attribute on the part itself, set again after every render (a visit swaps its screens).
  useEffect(() => {
    document.querySelectorAll(`[${HIGHLIGHT}]`).forEach(node => node.removeAttribute(HIGHLIGHT));
    if (!highlight) return;
    const own = highlight.field ? document.querySelector(`[data-preview-field~="${CSS.escape(highlight.field)}"]`) : null;
    (own ?? elementOf(highlight.area))?.setAttribute(HIGHLIGHT, "");
  }, [highlight, draft]);
  if (!draft) return <p style={{ padding: 24, fontFamily: "var(--font-body)", color: "#5b6476" }}>Menyiapkan pratinjau…</p>;
  // An E-Guide is a book, not an invitation: the preview shows the reader the guest gets.
  return <Boundary attempt={draft.version}>{draft.event.event_kind === "eguide" ? <GuidePage event={draft.event} />
    // The editor previews the page as donors see it before anything is confirmed; the form only pretends to send.
    : draft.event.event_kind === "panduan" ? <PlaceGuide event={draft.event} />
    : draft.event.event_kind === "csr" ? <CsrExperience event={draft.event} preview view={{ totals: donationTotals(draft.event.donation, []), donors: [], ready: true }} />
    : <EventExperience event={draft.event} phase={draft.phase} preview previewNotice={false} invitation={draft.guest ? { name: draft.guest, token: "pratinjau", rsvp: null, party_size_max: 1 } : undefined} />}
    {highlight && <>
      <style>{`[${HIGHLIGHT}] { outline: 3px solid #2563eb; outline-offset: -3px; }`}</style>
      {highlight.label && <p role="status" style={{ position: "fixed", top: 8, left: 8, zIndex: 50, margin: 0, padding: "4px 10px", borderRadius: 6, background: "#2563eb", color: "#fff", font: "600 13px/1.4 var(--font-body, sans-serif)", pointerEvents: "none" }}>{highlight.label}</p>}
    </>}</Boundary>;
}
