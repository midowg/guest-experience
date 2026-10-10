"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { InvitationHero } from "@/components/guest/InvitationHero";
import { dragFrame, getFraming } from "@/lib/hero-framing";
import { previewUpdateSchema, type HeroPreviewEvent } from "@/lib/hero-preview";
import type { PhotoFrame } from "@/lib/types";
import styles from "@/components/guest/guest.module.css";

export default function HeroPreviewPage() {
  const [event, setEvent] = useState<HeroPreviewEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; frame: PhotoFrame; width: number; height: number; nw: number; nh: number; device: "mobile" | "desktop" } | null>(null);
  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.origin !== location.origin || message.source !== parent || parent === window) return;
      const parsed = previewUpdateSchema.safeParse(message.data);
      if (parsed.success) { setEvent(parsed.data.event); setEditing(parsed.data.editing); }
    };
    window.addEventListener("message", receive);
    parent.postMessage({ type: "hero:ready" }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  function begin(e: PointerEvent<HTMLDivElement>) {
    if (!editing || !event || e.button !== 0) return;
    const image = surface.current?.querySelector<HTMLImageElement>("[data-hero-photo]");
    const box = image?.parentElement?.getBoundingClientRect();
    if (!image?.naturalWidth || !box) return;
    const device = window.innerWidth <= 720 ? "mobile" : "desktop";
    drag.current = { x: e.clientX, y: e.clientY, frame: getFraming(event.hero)[device], width: box.width, height: box.height, nw: image.naturalWidth, nh: image.naturalHeight, device };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !event) return;
    const frame = dragFrame(start.frame, e.clientX - start.x, e.clientY - start.y, start.width, start.height, start.nw, start.nh);
    setEvent(current => current ? { ...current, hero: { ...current.hero, framing: { ...getFraming(current.hero), [start.device]: frame } } } : current);
    parent.postMessage({ type: "hero:frame", device: start.device, frame }, location.origin);
  }
  return <div ref={surface} className={styles.experience} onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onDragStart={e => e.preventDefault()} style={{ touchAction: editing ? "none" : "auto", cursor: editing ? "grab" : "default" }}>
    {event ? <InvitationHero event={event} inert /> : <p role="status">Menunggu pratinjau editor…</p>}
  </div>;
}
