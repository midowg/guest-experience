"use client";

import { useEffect, useRef, useState } from "react";
import { isPreviewMessage, type PreviewArea, type PreviewMessage } from "@/lib/live-preview";
import type { EventPhase, EventRecord } from "@/lib/types";
import styles from "./editor.module.css";

/** A real phone viewport, so the guest page's own phone layout and media queries apply. */
const SCREEN = { width: 390, height: 844 };
const BEZEL = 12;
/** Status bar above the page, as on a real phone; the notch sits in it, not over the page. */
const STATUS_BAR = 34;
/** The iframe is same-origin; messages carry the draft only to it. */
function postTo(frame: HTMLIFrameElement | null, message: PreviewMessage) { frame?.contentWindow?.postMessage(message, location.origin); }
const phases: { key: EventPhase; label: string }[] = [{ key: "before", label: "Sebelum" }, { key: "day", label: "Hari H" }, { key: "after", label: "Sesudah" }];

type Props = {
  event: EventRecord; phase: EventPhase; onPhase: (phase: EventPhase) => void;
  /** The part of the page the open block changes; the preview scrolls there. */
  focus: PreviewArea | null;
  /** A tap on a part of the preview: the editor opens its block. */
  onFocusArea: (area: PreviewArea) => void;
  /** Where the preview page lives; development previews use one that needs no sign-in. */
  src?: string;
};

/**
 * The invitation as a guest sees it, in a phone frame beside the form. It updates while typing
 * (unsaved), shows the chosen journey phase, and a tap on any part opens the block that edits it.
 */
export function PhonePreview({ event, phase, onPhase, focus, onFocusArea, src = "/admin/pratinjau-langsung" }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);
  const [ready, setReady] = useState(false);
  const latest = useRef({ event, phase, onFocusArea });
  useEffect(() => { latest.current = { event, phase, onFocusArea }; }, [event, phase, onFocusArea]);


  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.origin !== location.origin || message.source !== frame.current?.contentWindow || !isPreviewMessage(message.data)) return;
      if (message.data.type === "preview:ready") {
        setReady(true);
        postTo(frame.current, { type: "preview:update", event: latest.current.event, phase: latest.current.phase });
      }
      if (message.data.type === "preview:focus") latest.current.onFocusArea(message.data.area);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  // Typing sends at most a few updates a second; the phone re-renders the whole page each time.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => postTo(frame.current, { type: "preview:update", event, phase }), 250);
    return () => window.clearTimeout(timer);
  }, [event, phase, ready]);

  useEffect(() => { if (ready && focus) postTo(frame.current, { type: "preview:scroll", area: focus }); }, [focus, ready]);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const fit = () => {
      const { width, height } = node.getBoundingClientRect();
      const next = Math.min(width / (SCREEN.width + BEZEL * 2), (height || Infinity) / (SCREEN.height + BEZEL * 2), 1);
      if (next > 0) setScale(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div className={styles.preview}>
    <div className={styles.previewBar}>
      <div className={styles.phaseSwitch} role="group" aria-label="Tampilan undangan">
        {phases.map(item => <button key={item.key} type="button" aria-pressed={phase === item.key} onClick={() => onPhase(item.key)}>{item.label}</button>)}
      </div>
      <span className={styles.previewHint}>Ketuk bagian untuk mengubahnya</span>
    </div>
    <div ref={stage} className={styles.phoneStage}>
      <div className={styles.phone} style={{ width: (SCREEN.width + BEZEL * 2) * scale, height: (SCREEN.height + BEZEL * 2) * scale }}>
        <div className={styles.phoneBody} style={{ width: SCREEN.width + BEZEL * 2, height: SCREEN.height + BEZEL * 2, transform: `scale(${scale})` }}>
          <div className={styles.phoneScreen}>
            <div className={styles.phoneStatus} aria-hidden="true"><span>09.41</span><span className={styles.phoneNotch} /><span>100%</span></div>
            <iframe ref={frame} className={styles.phoneFrame} src={src} title="Pratinjau undangan di ponsel" width={SCREEN.width} height={SCREEN.height - STATUS_BAR} />
          </div>
        </div>
      </div>
    </div>
  </div>;
}
