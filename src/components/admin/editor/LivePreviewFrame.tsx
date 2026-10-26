"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { EventExperience } from "@/components/guest/EventExperience";
import { GuidePage } from "@/components/guest/GuidePage";
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
  const [draft, setDraft] = useState<{ event: EventRecord; phase: EventPhase; version: number } | null>(null);
  useEffect(() => {
    const send = (message: PreviewMessage) => parent.postMessage(message, location.origin);
    const receive = (message: MessageEvent) => {
      if (message.origin !== location.origin || message.source !== parent || parent === window || !isPreviewMessage(message.data)) return;
      const data = message.data;
      if (data.type === "preview:update") setDraft(current => ({ event: normalizeEvent(prepareEvent(data.event)), phase: data.phase, version: (current?.version ?? 0) + 1 }));
      if (data.type === "preview:scroll") {
        const target = data.area === "hero" ? document.querySelector("[data-invitation-hero]") : data.area === "day" ? document.querySelector("[data-today-panel]") : data.area === "after" ? document.querySelector("[data-after-panel]") : document.getElementById(data.area);
        // scrollIntoView would also scroll the editor page around the frame; move this window only.
        if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 8, behavior: "smooth" });
      }
    };
    const click = (e: MouseEvent) => {
      const target = e.target as Element;
      const link = target.closest("a[href]");
      // Leaving for WhatsApp, Maps or a calendar file would take the editor's preview with it.
      if (link && !link.getAttribute("href")!.startsWith("#")) e.preventDefault();
      const area = areaOf(target);
      if (area) send({ type: "preview:focus", area });
    };
    window.addEventListener("message", receive);
    document.addEventListener("click", click, true);
    send({ type: "preview:ready" });
    return () => { window.removeEventListener("message", receive); document.removeEventListener("click", click, true); };
  }, []);
  if (!draft) return <p style={{ padding: 24, fontFamily: "var(--font-body)", color: "#5b6476" }}>Menyiapkan pratinjau…</p>;
  // An E-Guide is a book, not an invitation: the preview shows the reader the guest gets.
  return <Boundary attempt={draft.version}>{draft.event.event_kind === "eguide" ? <GuidePage event={draft.event} /> : <EventExperience event={draft.event} phase={draft.phase} preview previewNotice={false} />}</Boundary>;
}
