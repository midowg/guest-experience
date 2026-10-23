"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Camera } from "lucide-react";
import { dragFrame } from "@/lib/hero-framing";
import { activePalette, partOf, photoPlacement, posterSizes, slotShows, toneColor, type PosterBox, type PosterField, type PosterFormat, type PosterSettings, type PosterValues } from "@/lib/poster";
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
  /** Outside editing, a tap on a box the guest may fill (the studio then opens it). */
  onTap?: (key: string) => void;
  /** Guests' photos may be dragged and zoomed in place without editing mode (the form beside it fills the rest). */
  movePhotos?: boolean;
  /** The admin's arranging: every box can be dragged and resized; a tap selects it. */
  onArrange?: (key: string, box: PosterBox) => void;
};

const clampZoom = (zoom: number) => Math.min(3, Math.max(1, Math.round(zoom * 100) / 100));

/**
 * The poster at its design size (1080 px wide), scaled to the space it has. Boxes sit at the
 * design pixels the admin typed from Figma, so they land on the same spot on every screen.
 */
export function PosterCanvas({ poster, values, format, editing, hints, selected, onSelect, onFrame, fontsVersion, onTap, onArrange, movePhotos = false }: Props) {
  const size = posterSizes[format];
  const holder = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [natural, setNatural] = useState<Record<string, { width: number; height: number }>>({});
  const gesture = useRef<{ key: string; pointers: Map<number, { x: number; y: number }>; frame: PhotoFrame; distance: number; moved: boolean } | null>(null);

  // Measured before the first paint, so the poster never shows at a wrong size first.
  useLayoutEffect(() => {
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
  const palette = activePalette(poster, values);
  const background = posterBackground(poster, format, palette);
  const overlay = poster.formats[format].overlay?.url ?? "";
  // A box's own pictures from Figma, drawn at the size of the card like the overlay.
  const slots = (kind: PosterField["kind"]) => poster.fields.filter(field => field.kind === kind && field.box[format]).flatMap(field => {
    const url = partOf(poster, format, field.key)?.slot.url;
    return url && slotShows(field, values, hints) ? [{ key: field.key, url }] : [];
  });
  // The "upload a photo" marks: on screen only, while the box is empty.
  const marks = hints || editing ? poster.fields.filter(field => field.kind === "photo" && field.box[format] && !values.photos[field.key]).flatMap(field => {
    const url = partOf(poster, format, field.key)?.art.url;
    return url ? [{ key: field.key, url }] : [];
  }) : [];
  const ring = Math.max(2, 2 / scale);

  function photoDown(field: PosterField, event: ReactPointerEvent<HTMLDivElement>) {
    if (!(editing || movePhotos) || !field.editable) return;
    const photo = values.photos[field.key];
    if (!editing && !photo) return;
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
    <div className={styles.poster} data-editing={editing || undefined} onClick={onTap && !editing ? event => { const key = (event.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field; if (key && poster.fields.some(field => field.key === key && field.editable)) onTap(key); } : undefined} style={{ width: size.width, height: size.height, transform: `scale(${scale})`, background: palette.colors.background }} aria-label={`Poster ${size.label}`} role="img">
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size and redrawn on the download canvas */}
      {background && <img className={styles.background} src={background} alt="" crossOrigin="anonymous" draggable={false} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size, like the background */}
      {slots("photo").map(slot => <img key={`slot-${slot.key}`} className={styles.background} src={slot.url} alt="" crossOrigin="anonymous" draggable={false} />)}
      {poster.fields.map(field => {
        const box = field.box[format];
        if (field.kind !== "photo" || !box) return null;
        const photo = values.photos[field.key];
        const image = natural[field.key];
        const place = photo && image ? photoPlacement(box, image, photo.frame) : null;
        const open = editing && field.editable;
        if (!photo && !open && !(hints && field.editable)) return null;
        return <div key={field.key} data-field={field.key} className={styles.photo} data-open={open || undefined} data-movable={(movePhotos && photo && field.editable) || undefined} data-selected={selected === field.key || undefined}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: field.radius, "--ring": `${ring}px` } as CSSProperties}
          onPointerDown={event => photoDown(field, event)} onPointerMove={event => photoMove(field, event)} onPointerUp={event => photoUp(field, event)} onPointerCancel={event => photoUp(field, event)}
          onWheel={event => { if (!(open || movePhotos) || !photo || !field.editable) return; onFrame(field.key, { ...photo.frame, zoom: clampZoom(photo.frame.zoom - Math.sign(event.deltaY) * 0.08) }); }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local photo (object URL), never uploaded */}
          {photo && <img src={photo.url} alt="" draggable={false} onLoad={event => { const { naturalWidth: width, naturalHeight: height } = event.currentTarget; setNatural(current => current[field.key]?.width === width && current[field.key]?.height === height ? current : { ...current, [field.key]: { width, height } }); }}
            style={place ? { left: place.left, top: place.top, width: place.width, height: place.height } : { opacity: 0 }} />}
          {!photo && (open || hints) && !marks.some(mark => mark.key === field.key) && <span className={styles.photoHint} style={{ fontSize: Math.max(18, Math.min(34, box.w / 9)) }}><Camera size={Math.max(28, Math.min(64, box.w / 6))} aria-hidden="true" />{field.hint}</span>}
        </div>;
      })}
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size, like the background */}
      {marks.map(mark => <img key={`art-${mark.key}`} className={styles.background} src={mark.url} alt="" crossOrigin="anonymous" draggable={false} />)}
      {/* Over the photos, under the text: what sat on top of a photo in Figma. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size, like the background */}
      {overlay && <img className={styles.background} src={overlay} alt="" crossOrigin="anonymous" draggable={false} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size, like the background */}
      {slots("text").map(slot => <img key={`slot-${slot.key}`} className={styles.background} src={slot.url} alt="" crossOrigin="anonymous" draggable={false} />)}
      {/* A stacked item's heading and divider, moved with it; one left out takes them along (layoutTexts). */}
      {texts.flatMap(({ field, labelShift }) => {
        const url = labelShift && partOf(poster, format, field.key)?.label?.url;
        if (!labelShift || !url) return [];
        const { box, dy } = labelShift;
        return [<div key={`label-${field.key}`} className={styles.label} data-label={field.key} style={{ left: box.x, top: box.y + dy, width: box.w, height: box.h }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn at design size, like the background, and cropped to the heading */}
          <img src={url} alt="" crossOrigin="anonymous" draggable={false} style={{ left: -box.x, top: -box.y, width: size.width, height: size.height }} />
        </div>];
      })}
      {texts.map(({ field, fitted, hint, box }) => {
        const open = editing && field.editable;
        const line = fitted.size * fitted.lineHeight;
        const style = { left: box.x, top: box.y, width: box.w, height: box.h, font: fontOf(field, fitted.size), color: toneColor(field, palette), textAlign: field.align, letterSpacing: `${field.letterSpacing}em`, "--ring": `${ring}px` } as CSSProperties;
        // A list point's later lines start after its bullet, as the download draws them (export.ts).
        const lines = fitted.lines.map((text, index) => <span key={index} style={{ height: line, lineHeight: `${line}px`, paddingLeft: fitted.indents?.[index] || undefined }}>{text}</span>);
        return open
          ? <button key={field.key} data-field={field.key} type="button" className={styles.text} data-open data-hint={hint || undefined} data-selected={selected === field.key || undefined} style={style} onClick={() => onSelect(field.key)} aria-label={`Ubah ${field.label}`}>{lines}</button>
          : <div key={field.key} data-field={field.key} className={styles.text} data-tap={(onTap && field.editable) || undefined} style={style}>{lines}</div>;
      })}
      {editing && poster.fields.filter(field => field.kind === "text" && field.editable && field.box[format] && !texts.some(item => item.field.key === field.key)).map(field => {
        // An editable box with neither text nor hint still needs something to tap.
        const box = field.box[format]!;
        return <button key={field.key} data-field={field.key} type="button" className={styles.text} data-open data-hint data-selected={selected === field.key || undefined} style={{ left: box.x, top: box.y, width: box.w, height: box.h, "--ring": `${ring}px` } as CSSProperties} onClick={() => onSelect(field.key)} aria-label={`Ubah ${field.label}`} />;
      })}
      {onArrange && <ArrangeLayer poster={poster} format={format} scale={scale} selected={selected} onSelect={onSelect} onArrange={onArrange} />}
    </div>
  </div>;
}

function spread(pointers: Map<number, { x: number; y: number }>) {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

/**
 * Handles over every box for the admin: drag a box to move it, its corner to resize it, tap to
 * select it. Arrow keys move the selected box by 1 px (10 px with Shift). Boxes stay inside.
 */
function ArrangeLayer({ poster, format, scale, selected, onSelect, onArrange }: { poster: PosterSettings; format: PosterFormat; scale: number; selected: string | null; onSelect: (key: string) => void; onArrange: (key: string, box: PosterBox) => void }) {
  const size = posterSizes[format];
  const drag = useRef<{ key: string; mode: "move" | "resize"; x: number; y: number; box: PosterBox; moved: boolean } | null>(null);
  const handle = Math.max(16, 16 / scale);
  const fit = (box: PosterBox): PosterBox => {
    const w = Math.round(Math.min(Math.max(box.w, 20), size.width)), h = Math.round(Math.min(Math.max(box.h, 20), size.height));
    return { x: Math.round(Math.min(Math.max(box.x, 0), size.width - w)), y: Math.round(Math.min(Math.max(box.y, 0), size.height - h)), w, h };
  };
  function down(event: ReactPointerEvent<HTMLElement>, key: string, box: PosterBox, mode: "move" | "resize") {
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
    drag.current = { key, mode, x: event.clientX, y: event.clientY, box, moved: false };
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = (event.clientX - state.x) / scale, dy = (event.clientY - state.y) / scale;
    if (!state.moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return;
    state.moved = true;
    const { box } = state;
    onArrange(state.key, fit(state.mode === "move" ? { ...box, x: box.x + dx, y: box.y + dy } : { ...box, w: box.w + dx, h: box.h + dy }));
  }
  function up() {
    const state = drag.current;
    if (state && !state.moved) onSelect(state.key);
    drag.current = null;
  }
  return <div className={styles.arrange} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {poster.fields.map(field => {
      const box = field.box[format];
      if (!box) return null;
      const here = selected === field.key;
      return <div key={field.key} role="button" tabIndex={0} aria-label={`Atur ${field.label}`} aria-pressed={here} className={styles.arrangeBox} data-selected={here || undefined} data-locked={!field.editable || undefined}
        style={{ left: box.x, top: box.y, width: box.w, height: box.h, "--ring": `${Math.max(2, 2 / scale)}px` } as CSSProperties}
        onPointerDown={event => down(event, field.key, box, "move")}
        onKeyDown={event => {
          const step = event.shiftKey ? 10 : 1;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(field.key); return; }
          const by = moves[event.key];
          if (!by) return;
          event.preventDefault();
          onArrange(field.key, fit({ ...box, x: box.x + by[0], y: box.y + by[1] }));
        }}>
        {here && <span className={styles.arrangeLabel} style={{ fontSize: Math.max(12, 13 / scale) }}>{field.label}</span>}
        {here && <span className={styles.arrangeHandle} style={{ width: handle, height: handle }} aria-hidden="true" onPointerDown={event => down(event, field.key, box, "resize")} />}
      </div>;
    })}
  </div>;
}
