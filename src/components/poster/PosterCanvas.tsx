"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Camera } from "lucide-react";
import { dragFrame } from "@/lib/hero-framing";
import { photoPlacement, posterSizes, type PosterField, type PosterFormat, type PosterSettings, type PosterValues } from "@/lib/poster";
import type { PhotoFrame } from "@/lib/types";
import { fontOf, layoutTexts, posterBackground } from "./layout";
import styles from "./poster.module.css";

type Props = {
  poster: PosterSettings; values: PosterValues; format: PosterFormat;
  /** Boxes open for editing; `hints` shows the grey hint of an empty box. */
  editing: boolean; hints: boolean; selected: string | null;
  onSelect: (key: string) => void;
  onFrame: (key: string, frame: PhotoFrame) => void;
  /** Bumped once the fonts are in, so the lines are measured again with the real faces. */
  fontsVersion: number;
};

const clampZoom = (zoom: number) => Math.min(3, Math.max(1, Math.round(zoom * 100) / 100));

/**
 * The poster at its design size (1080 px wide), scaled to the space it has. Boxes sit at the
 * design pixels the admin typed from Figma, so they land on the same spot on every screen.
 */
export function PosterCanvas({ poster, values, format, editing, hints, selected, onSelect, onFrame, fontsVersion }: Props) {
  const size = posterSizes[format];
  const holder = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [natural, setNatural] = useState<Record<string, { width: number; height: number }>>({});
  const gesture = useRef<{ key: string; pointers: Map<number, { x: number; y: number }>; frame: PhotoFrame; distance: number; moved: boolean } | null>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const fit = () => { const width = node.clientWidth; if (width > 0) setScale(width / size.width); };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [size.width]);

  // Text is laid out in the browser only, once its faces are in (fontsVersion > 0): the server has
  // no fonts to measure with, and a first guess would break lines differently.
  const texts = useMemo(() => fontsVersion > 0 ? layoutTexts(poster, values, format, hints) : [], [poster, values, format, hints, fontsVersion]);
  const background = posterBackground(poster, format);
  const ring = Math.max(2, 2 / scale);

  function photoDown(field: PosterField, event: ReactPointerEvent<HTMLDivElement>) {
    if (!editing || !field.editable) return;
    const photo = values.photos[field.key];
    const current = gesture.current?.key === field.key ? gesture.current : null;
    const pointers = current?.pointers ?? new Map<number, { x: number; y: number }>();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Keeps the drag when the finger leaves the box; some browsers refuse it, which is harmless.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
    gesture.current = { key: field.key, pointers, frame: photo?.frame ?? { x: 50, y: 50, zoom: 1 }, distance: spread(pointers), moved: false };
  }
  function photoMove(field: PosterField, event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    const photo = values.photos[field.key];
    const box = field.box[format];
    const image = natural[field.key];
    if (!state || state.key !== field.key || !photo || !box || !image || !state.pointers.has(event.pointerId)) return;
    const before = state.pointers.get(event.pointerId)!;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointers.size >= 2) {
      // Two fingers: the photo zooms as they spread or pinch.
      const distance = spread(state.pointers);
      if (state.distance > 0) state.frame = { ...state.frame, zoom: clampZoom(state.frame.zoom * distance / state.distance) };
      state.distance = distance;
    } else {
      const dx = (event.clientX - before.x) / scale, dy = (event.clientY - before.y) / scale;
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      state.frame = dragFrame(state.frame, dx, dy, box.w, box.h, image.width, image.height);
    }
    state.moved = true;
    onFrame(field.key, state.frame);
  }
  function photoUp(field: PosterField, event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || state.key !== field.key) return;
    state.pointers.delete(event.pointerId);
    state.distance = spread(state.pointers);
    if (state.pointers.size === 0) { if (!state.moved) onSelect(field.key); gesture.current = null; }
  }

  return <div ref={holder} className={styles.holder} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
    <div className={styles.poster} data-editing={editing || undefined} style={{ width: size.width, height: size.height, transform: `scale(${scale})` }} aria-label={`Poster ${size.label}`} role="img">
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size and redrawn on the download canvas */}
      {background && <img className={styles.background} src={background} alt="" crossOrigin="anonymous" draggable={false} />}
      {poster.fields.map(field => {
        const box = field.box[format];
        if (field.kind !== "photo" || !box) return null;
        const photo = values.photos[field.key];
        const image = natural[field.key];
        const place = photo && image ? photoPlacement(box, image, photo.frame) : null;
        const open = editing && field.editable;
        if (!photo && !open && !(hints && field.editable)) return null;
        return <div key={field.key} data-field={field.key} className={styles.photo} data-open={open || undefined} data-selected={selected === field.key || undefined}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: field.radius, "--ring": `${ring}px` } as CSSProperties}
          onPointerDown={event => photoDown(field, event)} onPointerMove={event => photoMove(field, event)} onPointerUp={event => photoUp(field, event)} onPointerCancel={event => photoUp(field, event)}
          onWheel={event => { if (!open || !photo) return; onFrame(field.key, { ...photo.frame, zoom: clampZoom(photo.frame.zoom - Math.sign(event.deltaY) * 0.08) }); }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local photo (object URL), never uploaded */}
          {photo && <img src={photo.url} alt="" draggable={false} onLoad={event => { const { naturalWidth: width, naturalHeight: height } = event.currentTarget; setNatural(current => current[field.key]?.width === width && current[field.key]?.height === height ? current : { ...current, [field.key]: { width, height } }); }}
            style={place ? { left: place.left, top: place.top, width: place.width, height: place.height } : { opacity: 0 }} />}
          {!photo && (open || hints) && <span className={styles.photoHint} style={{ fontSize: Math.max(18, Math.min(34, box.w / 9)) }}><Camera size={Math.max(28, Math.min(64, box.w / 6))} aria-hidden="true" />{field.hint}</span>}
        </div>;
      })}
      {texts.map(({ field, fitted, hint }) => {
        const box = field.box[format]!;
        const open = editing && field.editable;
        const line = fitted.size * fitted.lineHeight;
        const style = { left: box.x, top: box.y, width: box.w, height: box.h, font: fontOf(field, fitted.size), color: field.color, textAlign: field.align, letterSpacing: `${field.letterSpacing}em`, "--ring": `${ring}px` } as CSSProperties;
        const lines = fitted.lines.map((text, index) => <span key={index} style={{ height: line, lineHeight: `${line}px` }}>{text}</span>);
        return open
          ? <button key={field.key} data-field={field.key} type="button" className={styles.text} data-open data-hint={hint || undefined} data-selected={selected === field.key || undefined} style={style} onClick={() => onSelect(field.key)} aria-label={`Ubah ${field.label}`}>{lines}</button>
          : <div key={field.key} className={styles.text} style={style}>{lines}</div>;
      })}
      {editing && poster.fields.filter(field => field.kind === "text" && field.editable && field.box[format] && !texts.some(item => item.field.key === field.key)).map(field => {
        // An editable box with neither text nor hint still needs something to tap.
        const box = field.box[format]!;
        return <button key={field.key} data-field={field.key} type="button" className={styles.text} data-open data-hint data-selected={selected === field.key || undefined} style={{ left: box.x, top: box.y, width: box.w, height: box.h, "--ring": `${ring}px` } as CSSProperties} onClick={() => onSelect(field.key)} aria-label={`Ubah ${field.label}`} />;
      })}
    </div>
  </div>;
}

function spread(pointers: Map<number, { x: number; y: number }>) {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
