"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/main-wam/ui";
import { cellBounds, gridGeometry } from "@/lib/main-wam/momen/mosaic";
import type { MosaicManifest } from "@/lib/main-wam/momen/types";
import css from "./mosaic.module.css";

/*
 * The Mozaik drawn on one <canvas> (RISET §9: never hundreds of animated elements): cells square,
 * the grid centred in a 16:9 box (the venue TV's shape). Empty cells are thin outlines (inside the
 * letters tinted with the event colour); a filled cell shows its 160 px tile, inside the letters
 * under the event colour, so "WAM 2026" stands out as photos arrive. Tiles are cached per photo, so
 * a refresh draws only what changed. Zoom with + / − (or two fingers), pan by scrolling.
 * "Tandai fotoku": the others dimmed, one's own outlined and numbered.
 */

export const MOSAIC_ZOOMS = [1, 2, 3] as const;
const PAD = 12;

type Colors = { outline: string; accent: string; accentSoft: string; accentLine: string; primary: string; ph: string[] };

function rgba(color: string, alpha: number): string {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split("").map(char => char + char).join("") : hex[1];
    return `rgba(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) { const [r, g, b] = rgb[1].split(/[ ,/]+/); return `rgba(${r}, ${g}, ${b}, ${alpha})`; }
  return value;
}

function readColors(element: HTMLElement): Colors {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const accent = token("--mw-accent", "#1E3A5F");
  return {
    outline: token("--mw-outline-2", "#E5E7EB"), accent, accentSoft: rgba(accent, 0.12), accentLine: rgba(accent, 0.55), primary: token("--mw-primary", "#2F6FEB"),
    // The placeholder tokens are gradients: a cell takes their first colour.
    ph: [1, 2, 3, 4, 5, 6].map(n => /#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(token(`--mw-ph-${n}`, "#E5E7EB"))?.[0] ?? "#E5E7EB"),
  };
}

export function MosaicCanvas({ manifest, mark, zoom, onZoom, focus, label }: {
  manifest: MosaicManifest;
  /** "Tandai fotoku". */
  mark: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  /** A cell to bring into view (a photo of one's own chosen in the strip). */
  focus: number | null;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const frame = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, setLoaded] = useState(0);
  const pinch = useRef<{ pointers: Map<number, { x: number; y: number }>; start: number; zoom: number } | null>(null);

  const tiles = useMemo(() => new Map(manifest.tiles.map(tile => [tile.cell, tile])), [manifest.tiles]);
  const mine = useMemo(() => manifest.tiles.filter(tile => tile.mine).map(tile => tile.cell).sort((a, b) => a - b), [manifest.tiles]);

  // The box's size (it changes with the screen, the zoom, full screen).
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Tiles: one image per photo, kept; a new one asks for a redraw when it has loaded.
  useEffect(() => {
    for (const tile of manifest.tiles) {
      if (!tile.src || images.current.has(tile.id)) continue;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => setLoaded(count => count + 1);
      image.src = tile.src;
      images.current.set(tile.id, image);
    }
  }, [manifest.tiles]);

  const width = size.width * zoom, height = size.height * zoom;
  // A margin of 12 around the grid inside the box (the prototype's frame).
  const geometry = useMemo(() => {
    const inner = gridGeometry({ width: Math.max(1, width - 2 * PAD), height: Math.max(1, height - 2 * PAD) }, manifest.columns, manifest.rows, zoom > 1 ? 2 : 1);
    return { ...inner, left: inner.left + PAD, top: inner.top + PAD };
  }, [width, height, manifest.columns, manifest.rows, zoom]);
  const cellAt = useCallback((cell: number) => {
    const gap = zoom > 1 ? 2 : 1;
    const column = cell % manifest.columns, row = Math.floor(cell / manifest.columns);
    return { x: geometry.left + column * (geometry.cell + gap), y: geometry.top + row * (geometry.cell + gap) };
  }, [geometry, manifest.columns, zoom]);

  // Draw.
  useEffect(() => {
    const element = canvas.current, holder = box.current;
    if (!element || !holder || !width || !height) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      const context = element.getContext("2d");
      if (!context) return;
      const colors = readColors(holder);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const side = geometry.cell;
      const mineSet = new Set(mine);
      for (let cell = 0; cell < manifest.columns * manifest.rows; cell++) {
        const { x, y } = cellAt(cell);
        const letter = manifest.cells[cell] && manifest.cells[cell] !== ".";
        const tile = tiles.get(cell);
        context.globalAlpha = mark && mineSet.size > 0 && !(tile && mineSet.has(cell)) ? 0.4 : 1;
        if (!tile) {
          if (letter) { context.fillStyle = colors.accentSoft; context.fillRect(x, y, side, side); context.strokeStyle = colors.accentLine; }
          else context.strokeStyle = colors.outline;
          context.lineWidth = 1;
          context.strokeRect(x + 0.5, y + 0.5, side - 1, side - 1);
          continue;
        }
        const image = images.current.get(tile.id);
        if (image?.complete && image.naturalWidth) {
          const crop = Math.min(image.naturalWidth, image.naturalHeight);
          context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, x, y, side, side);
        } else {
          context.fillStyle = colors.ph[(cell * 7) % 6];
          context.fillRect(x, y, side, side);
        }
        if (letter) { context.fillStyle = rgba(colors.accent, image?.complete && image.naturalWidth ? 0.72 : 1); context.fillRect(x, y, side, side); }
      }
      context.globalAlpha = 1;
      if (mark) {
        context.strokeStyle = colors.primary;
        context.lineWidth = 2;
        for (const cell of mine) { const { x, y } = cellAt(cell); context.strokeRect(x - 1, y - 1, side + 2, side + 2); }
      }
    });
    return () => cancelAnimationFrame(frame.current);
  });

  // "Tandai fotoku": zoom to one's own cells; a chosen one comes into view.
  useEffect(() => {
    if (!mark || !mine.length) return;
    const bounds = cellBounds(mine, manifest.columns);
    if (!bounds || !size.width) return;
    const span = Math.max((bounds.right - bounds.left + 3) / manifest.columns, (bounds.bottom - bounds.top + 3) / manifest.rows);
    // At least 2× (the cells become big enough to see one's photo), up to what holds them all.
    onZoom(Math.max(2, Math.min(3, Math.floor(1 / span))));
  }, [mark, mine, manifest.columns, manifest.rows, size.width, onZoom]);
  useEffect(() => {
    const element = box.current;
    if (!element || zoom <= 1) return;
    const cells = focus !== null ? [focus] : mark ? mine.slice(0, 1) : [];
    const bounds = cellBounds(cells, manifest.columns);
    if (!bounds) return;
    const first = cellAt(bounds.left + bounds.top * manifest.columns), lastCell = cellAt(bounds.right + bounds.bottom * manifest.columns);
    const centreX = (first.x + lastCell.x + geometry.cell) / 2, centreY = (first.y + lastCell.y + geometry.cell) / 2;
    element.scrollTo({ left: centreX - element.clientWidth / 2, top: centreY - element.clientHeight / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [zoom, focus, mark, mine, manifest.columns, cellAt, geometry.cell]);

  // Two fingers: zoom between 1× and 3× (the buttons are the one-finger way).
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    const state = pinch.current ?? { pointers: new Map(), start: 0, zoom };
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointers.size === 2) { const [a, b] = [...state.pointers.values()]; state.start = Math.hypot(a.x - b.x, a.y - b.y); state.zoom = zoom; }
    pinch.current = state;
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = pinch.current;
    if (!state?.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointers.size !== 2 || !state.start) return;
    const [a, b] = [...state.pointers.values()];
    const next = Math.round(Math.min(3, Math.max(1, state.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / state.start))));
    if (next !== zoom) onZoom(next);
  }
  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pinch.current?.pointers.delete(event.pointerId);
    if (!pinch.current?.pointers.size) pinch.current = null;
  }

  const tags = mark ? mine.map((cell, index) => { const { x, y } = cellAt(cell); return { cell, n: index + 1, x: x + geometry.cell / 2, y }; }) : [];
  return <div className={css.wrap}>
    <div ref={box} className={css.box} data-zoomed={zoom > 1 || undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <div className={css.inner} style={{ width: width || "100%", height: height || "100%" }}>
        <canvas ref={canvas} className={css.canvas} role="img" aria-label={label} />
        {tags.map(tag => <span key={tag.cell} className={css.tag} style={{ left: tag.x, top: tag.y }} aria-hidden>{tag.n}</span>)}
      </div>
    </div>
    <div className={css.zoom}>
      <IconButton icon={Plus} label="Perbesar" className={css.zoomBtn} disabled={zoom >= 3} onClick={() => onZoom(Math.min(3, zoom + 1))} />
      <IconButton icon={Minus} label="Perkecil" className={css.zoomBtn} disabled={zoom <= 1} onClick={() => onZoom(Math.max(1, zoom - 1))} />
    </div>
  </div>;
}
