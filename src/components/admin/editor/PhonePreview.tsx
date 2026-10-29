"use client";

import { useEffect, useRef, useState } from "react";
import { EyeOff, Maximize2, Minimize2, Monitor, Smartphone } from "lucide-react";
import { isPreviewMessage, type PreviewArea, type PreviewMessage } from "@/lib/live-preview";
import type { EventPhase, EventRecord } from "@/lib/types";
import styles from "./editor.module.css";

export type PreviewDevice = "mobile" | "web";

/**
 * Real viewports, so the guest page's own phone or desktop layout and media queries apply. The
 * phone has a bezel and a status bar (the notch sits in it, not over the page); the web view a
 * browser bar with the event's address.
 */
const DEVICES = {
  mobile: { width: 390, height: 844, frame: 12, bar: 34 },
  web: { width: 1280, height: 800, frame: 1, bar: 40 },
} as const;

/** The iframe is same-origin; messages carry the draft only to it. */
function postTo(frame: HTMLIFrameElement | null, message: PreviewMessage) { frame?.contentWindow?.postMessage(message, location.origin); }
const phases: { key: EventPhase; label: string }[] = [{ key: "before", label: "Sebelum" }, { key: "day", label: "Hari H" }, { key: "after", label: "Sesudah" }];

type Props = {
  event: EventRecord; phase: EventPhase; onPhase: (phase: EventPhase) => void;
  device: PreviewDevice; onDevice: (device: PreviewDevice) => void;
  /** The part of the page the open block changes; the preview scrolls there. */
  focus: PreviewArea | null;
  /** A tap on a part of the preview: the editor opens its block. */
  onFocusArea: (area: PreviewArea) => void;
  /** Shown in the web view's address bar. */
  address?: string;
  /** Where the preview page lives; development previews use one that needs no sign-in. */
  src?: string;
  /** Kunjungan Kantor: preview the general link, or a personal one that greets `guestName`. */
  link?: { personal: boolean; guestName: string; onPersonal: (personal: boolean) => void };
  /** The field being typed in: its part of the page gets a blue frame with this name. */
  highlight?: { area: PreviewArea; label: string; field?: string } | null;
  /** The open block is switched off: the preview says the guest does not see it. */
  hidden?: boolean;
};

/**
 * The invitation as a guest sees it, beside the form: on a phone (the default) or on the web. It
 * updates while typing (unsaved), shows the chosen journey phase, and a tap on any part opens the
 * block that edits it.
 */
export function PhonePreview({ event, phase, onPhase, device, onDevice, focus, onFocusArea, address = "", src = "/admin/pratinjau-langsung", link, highlight = null, hidden = false }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  const guest = link?.personal ? link.guestName : undefined;
  const latest = useRef({ event, phase, onFocusArea, focus, guest, highlight });
  useEffect(() => { latest.current = { event, phase, onFocusArea, focus, guest, highlight }; }, [event, phase, onFocusArea, focus, guest, highlight]);
  useEffect(() => {
    const sync = () => setFull(!!root.current && document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  /** Layar penuh: the preview alone on the screen, at its real size where it fits. */
  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.current?.requestFullscreen?.();
  }
  const size = DEVICES[device];

  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.origin !== location.origin || message.source !== frame.current?.contentWindow || !isPreviewMessage(message.data)) return;
      if (message.data.type === "preview:ready") {
        // Also after switching device: the new frame starts empty.
        setReady(true);
        postTo(frame.current, { type: "preview:update", event: latest.current.event, phase: latest.current.phase, guest: latest.current.guest });
        if (latest.current.focus) postTo(frame.current, { type: "preview:scroll", area: latest.current.focus });
        if (latest.current.highlight) postTo(frame.current, { type: "preview:highlight", ...latest.current.highlight });
      }
      if (message.data.type === "preview:focus") latest.current.onFocusArea(message.data.area);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  // Typing sends at most a few updates a second; the preview re-renders the whole page each time.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => postTo(frame.current, { type: "preview:update", event, phase, guest }), 250);
    return () => window.clearTimeout(timer);
  }, [event, phase, guest, ready]);

  useEffect(() => { if (ready) postTo(frame.current, { type: "preview:highlight", area: highlight?.area ?? null, label: highlight?.label, field: highlight?.field }); }, [highlight?.area, highlight?.label, highlight?.field, ready]);

  useEffect(() => { if (ready && focus) postTo(frame.current, { type: "preview:scroll", area: focus }); }, [focus, ready]);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const outerWidth = size.width + size.frame * 2;
    const outerHeight = size.height + size.frame * 2;
    const fit = () => {
      const { width, height } = node.getBoundingClientRect();
      // The phone fits the column height; the web view fits its width (its stage grows with it).
      const next = Math.min(width / outerWidth, device === "web" ? 1 : (height || Infinity) / outerHeight, 1);
      if (next > 0) setScale(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [size, device]);

  const outer = { width: size.width + size.frame * 2, height: size.height + size.frame * 2 };
  // One compact bar (two rows at most): the phone keeps the rest of the column's height, whatever the bar holds.
  return <div ref={root} className={styles.preview} data-full={full || undefined}>
    <div className={styles.previewBar}>
      {link && <div className={styles.phaseSwitch} role="group" aria-label="Tautan yang dipratinjau">
        <button type="button" aria-pressed={!link.personal} onClick={() => link.onPersonal(false)}>Tautan umum</button>
        <button type="button" aria-pressed={link.personal} onClick={() => link.onPersonal(true)} title={`Sapaan memakai nama ${link.guestName}`}>Tautan pribadi</button>
      </div>}
      <div className={`${styles.phaseSwitch} ${styles.iconSwitch}`} role="group" aria-label="Perangkat pratinjau">
        <button type="button" aria-pressed={device === "mobile"} onClick={() => onDevice("mobile")} aria-label="Ponsel" title="Ponsel"><Smartphone size={15} aria-hidden="true" /></button>
        <button type="button" aria-pressed={device === "web"} onClick={() => onDevice("web")} aria-label="Web" title="Web"><Monitor size={15} aria-hidden="true" /></button>
      </div>
      {/* An E-Guide reads the same before, on and after the day: no phases to switch. */}
      {event.event_kind !== "eguide" && event.event_kind !== "csr" && event.event_kind !== "panduan" && <div className={styles.phaseSwitch} role="group" aria-label="Tampilan undangan">
        {phases.map(item => <button key={item.key} type="button" aria-pressed={phase === item.key} onClick={() => onPhase(item.key)}>{item.label}</button>)}
      </div>}
      <button type="button" className={styles.fullButton} onClick={toggleFull} aria-pressed={full} aria-label={full ? "Keluar layar penuh" : "Layar penuh"} title={full ? "Keluar layar penuh" : "Layar penuh"}>{full ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}</button>
    </div>
    {hidden ? <span className={`${styles.previewHint} ${styles.previewHidden}`}><EyeOff size={14} aria-hidden="true" /> Disembunyikan dari tamu</span> : <span className={styles.previewHint}>Ketuk bagian untuk mengubahnya</span>}
    <div ref={stage} className={styles.phoneStage} data-device={device}>
      <div className={styles.phone} style={{ width: outer.width * scale, height: outer.height * scale }}>
        {device === "mobile"
          ? <div className={styles.phoneBody} style={{ width: outer.width, height: outer.height, transform: `scale(${scale})` }}>
            <div className={styles.phoneScreen}>
              <div className={styles.phoneStatus} aria-hidden="true"><span>09.41</span><span className={styles.phoneNotch} /><span>100%</span></div>
              <iframe ref={frame} className={styles.phoneFrame} src={src} title="Pratinjau undangan di ponsel" width={size.width} height={size.height - size.bar} />
            </div>
          </div>
          : <div className={styles.browserBody} style={{ width: outer.width, height: outer.height, transform: `scale(${scale})` }}>
            <div className={styles.browserBar} aria-hidden="true"><span className={styles.browserDots}><i /><i /><i /></span><span className={styles.browserAddress}>{address}</span></div>
            <iframe ref={frame} className={styles.phoneFrame} src={src} title="Pratinjau undangan di web" width={size.width} height={size.height - size.bar} />
          </div>}
      </div>
    </div>
  </div>;
}
