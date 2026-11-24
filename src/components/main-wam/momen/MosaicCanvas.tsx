"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Minus } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { IconButton } from "@/components/main-wam/ui";
import { cellBounds, gridGeometry, paletteIndex } from "@/lib/main-wam/momen/mosaic";
import type { MosaicManifest } from "@/lib/main-wam/momen/types";
import css from "./mosaic.module.css";

/*
 * The Mozaik drawn on one <canvas> (RISET §9: never hundreds of animated elements): cells square,
 * the grid fills a box of the grid's own shape. Empty cells are faint squares (a letter's in its palette colour,
 * the rest a faint grid), so "WAM 2026" reads even with no photo at all; a filled cell shows its 160 px tile, inside the
 * letters under the palette colour and outside them faded. Tiles are cached per photo, so
 * a refresh draws only what changed. Zoom with two fingers, a double tap or + / −, pan by scrolling.
 * "Tandai fotoku": one's own cells ringed in gold (numbered when zoomed).
 */

export const MOSAIC_ZOOMS = [1, 2, 3] as const;
const PAD = 2;

type Colors = { outline: string; gold: string; goldSoft: string; primary: string; palette: string[]; paletteSoft: string[]; ph: string[] };

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
  // The tokens are always set under the theme root; "transparent" only keeps a bare test element from throwing.
  const token = (name: string) => style.getPropertyValue(name).trim() || "transparent";
  const gold = token("--mw-gold");
  const palette = [1, 2, 3, 4, 5, 6, 7, 8].map(n => token(`--mw-mosaic-${n}`));
  return {
    outline: rgba(token("--mw-outline-2"), 0.55), gold, goldSoft: rgba(gold, 0.35), primary: token("--mw-primary"),
    palette, paletteSoft: palette.map(color => rgba(color, 0.45)),
    // The placeholder tokens are gradients: a cell takes their first colour.
    ph: [1, 2, 3, 4, 5, 6].map(n => /#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(token(`--mw-ph-${n}`))?.[0] ?? "transparent"),
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
  const t = useT();
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
  // A margin of 2 around the grid inside the box .
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
      for (let cell = 0; cell < manifest.columns * manifest.rows; cell++) {
        const { x, y } = cellAt(cell);
        const letter = manifest.cells[cell] && manifest.cells[cell] !== ".";
        const tile = tiles.get(cell);
        const colour = paletteIndex(cell);
        if (!tile) {
          // No photo yet: a letter cell is a faint coloured square (the letters read even with the mosaic empty), the rest a faint grid.
          context.fillStyle = letter ? colors.paletteSoft[colour] : colors.outline;
          context.globalAlpha = letter ? 1 : 0.5;
          context.fillRect(x, y, side, side);
          continue;
        }
        const image = images.current.get(tile.id);
        const ready = !!(image?.complete && image.naturalWidth);
        // A photo outside the letters is shown faded, so the letters (full strength, under their colour) stay readable
        // however colourful the photos around them are.
        context.globalAlpha = letter ? 1 : 0.14;
        if (ready && image) {
          const crop = Math.min(image.naturalWidth, image.naturalHeight);
          context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, x, y, side, side);
        } else {
          context.fillStyle = letter ? colors.palette[colour] : colors.ph[(cell * 7) % 6];
          context.fillRect(x, y, side, side);
        }
        if (letter && ready) { context.globalAlpha = 0.7; context.fillStyle = colors.palette[colour]; context.fillRect(x, y, side, side); }
      }
      context.globalAlpha = 1;
      if (mark) {
        // One's own cells: a gold ring with a soft glow (the prototype's .me).
        context.strokeStyle = colors.gold;
        context.shadowColor = colors.gold;
        context.shadowBlur = 6;
        context.lineWidth = Math.max(1.5, Math.min(3, side / 5));
        for (const cell of mine) { const { x, y } = cellAt(cell); context.fillStyle = colors.goldSoft; context.fillRect(x, y, side, side); context.strokeRect(x - 0.5, y - 0.5, side + 1, side + 1); }
        context.shadowBlur = 0;
      }
    });
    return () => cancelAnimationFrame(frame.current);
  });

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

  // Keyboard: + / − / 0 zoom (the one-finger way besides a double tap); the arrow keys scroll while zoomed.
  function onKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") onZoom(Math.min(3, zoom + 1));
    else if (event.key === "-") onZoom(Math.max(1, zoom - 1));
    else if (event.key === "0") onZoom(1);
  }

  const tags = mark && zoom > 1 ? mine.map((cell, index) => { const { x, y } = cellAt(cell); return { cell, n: index + 1, x: x + geometry.cell / 2, y }; }) : [];
  return <div className={css.wrap}>
    {/* Zoomed in, the canvas scrolls: focusable, so the arrow keys move it too (audit T-M04, WCAG 2.1.1). */}
    <div ref={box} className={css.box} data-zoomed={zoom > 1 || undefined} role="region" aria-label={t("momen.mos.canvas")} tabIndex={0} style={{ "--ratio": `${manifest.columns} / ${manifest.rows}` } as CSSProperties} onKeyDown={onKey} onDoubleClick={() => onZoom(zoom > 1 ? 1 : 2)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <div className={css.inner} style={{ width: width || "100%", height: height || "100%" }}>
        <canvas ref={canvas} className={css.canvas} role="img" aria-label={label} />
        {tags.map(tag => <span key={tag.cell} className={css.tag} style={{ left: tag.x, top: tag.y }} aria-hidden>{tag.n}</span>)}
      </div>
    </div>
    {zoom > 1 && <div className={css.zoom}>
      <IconButton icon={Minus} label={t("momen.mos.zoomOut")} className={css.zoomBtn} onClick={() => onZoom(Math.max(1, zoom - 1))} />
    </div>}
  </div>;
}
