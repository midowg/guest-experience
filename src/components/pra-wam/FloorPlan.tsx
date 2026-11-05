"use client";

import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import type { Room } from "@/lib/pra-wam/appraisal";
import {
  ENTRANCE, FIT_VIEW, FIXTURES, FOUNTAIN, PLAN_H, PLAN_SPOTS, PLAN_W, SEAT_SCALE, SITE, SITE_LINES, WORDS_BOTTOM, WORDS_TOP, ZOOM_MAX, ZOOM_MIN, clampView, isRoomSpot, moveView,
  pickableTone, placeRooms, quietName, revealRect, roomSeats, roomSpec, spotText, spotWords, zoomView, type DrawnSpot, type PlanStatus, type PlanTone, type PlanView, type Rect, type SiteKind,
} from "@/lib/pra-wam/floor-plan";
import type { DayStatus, DayTone } from "@/lib/pra-wam/room-day";
import { chairPaths, seatPlan, type SeatLayout } from "@/lib/pra-wam/seating";
import { roomGroup } from "@/lib/pra-wam/room-group";
import css from "./floor-plan.module.css";

/** `kindMain` / `kindSmall`: chair colours of main and small rooms (chairColors "kind"). */
export type LegendKey = PlanTone | DayTone | "selected" | "kindMain" | "kindSmall";
const defaultLegend: Record<LegendKey, string> = {
  free: "Kosong", busy: "Terpakai", mine: "Booking kamu", small: "Terlalu kecil", selected: "Dipilih", off: "Tidak bisa dibooking", closed: "Tutup",
  part: "Terpakai sebagian", full: "Penuh", kindMain: "Ruang utama", kindSmall: "Ruang kecil",
};
/** A room's status on the plan: for chosen hours (PlanStatus) or a whole day (DayStatus). */
type Status = PlanStatus | DayStatus;
/** The status in a few words, for the tooltip over the chosen room ("Antareja · 4 kursi · kosong"). */
const TONE_WORDS: Record<Status["tone"], string> = {
  free: "kosong", busy: "terpakai", mine: "booking kamu", small: "terlalu kecil", off: "tidak bisa dibooking", closed: "tutup", part: "terpakai sebagian", full: "penuh",
};
/** The tag on a taken room, so it reads as taken before its words do. */
const TAKEN_CHIP: Partial<Record<Status["tone"], string>> = { busy: "Terpakai", full: "Penuh" };
type Point = [number, number];

type Props = {
  rooms: Room[];
  /** The status of each WAM room, for the chosen date and hours (or the whole day): its colour and read-out. */
  statusOf: (room: Room) => Status;
  /** Picking a room; without it the plan is view only. */
  onPick?: (room: Room) => void;
  selectedId?: string;
  /** Ends each pickable room's label: "Nagapadma, kosong 09.00–10.00. Pilih ruang ini". */
  action?: string;
  /** Names the plan for screen readers, e.g. "Denah kantor, Rabu 4 Nov 09.00–10.00". */
  label: string;
  legend?: LegendKey[];
  /** A small line below the plan, e.g. what a tap does. */
  caption?: ReactNode;
  /** Other words for legend entries, e.g. closed: "Sudah lewat". */
  legendLabels?: Partial<Record<LegendKey, string>>;
  /** Which rooms a tap picks; by default a free or too small room, or the selected one. */
  pickable?: (room: Room, status: Status) => boolean;
  /** Rings this room without changing its words (the Book plan's room whose detail is open). */
  highlightId?: string;
  /**
   * Spots no WAM room takes are plain blocks. "label" (default) still names a spot that is a room's
   * (e.g. Pantry when there is no Pantry room); "plain" names none. Desks and the like are never named.
   */
  otherSpots?: "label" | "plain";
  /** Lists the WAM rooms without a spot below the plan (default). */
  showUnplaced?: boolean;
  /** The line under each room's name: its specification (default) or its status for the chosen hours. */
  subtitle?: "spec" | "status";
  /**
   * Super admin: every spot can be picked by its key, a room's or an empty one (shown with
   * `emptySpot`), and `selectedSpot` is ringed.
   */
  onPickSpot?: (key: string) => void;
  selectedSpot?: string;
  emptySpot?: PlanStatus;
  /**
   * What the chairs' colour says: the room's status (default), or whether it is a main or a small
   * room ("kind", the default with `onPickSpot`: the super admin's view of the rooms).
   */
  chairColors?: "status" | "kind";
};

/** "Kosong 09.00–10.00" → "kosong 09.00–10.00", for the middle of a sentence. */
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** Each + or − press: 1×, 1.6×, 2.5×, 4×. */
const ZOOM_STEP = Math.cbrt(ZOOM_MAX / ZOOM_MIN);
/** A press that moves less than this (px) is a tap, not a pan. */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const zoomWords = (scale: number) => `${(Math.round(scale * 10) / 10).toString().replace(".", ",")}×`;
const reducedMotion = () => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Gesture = {
  start: PlanView;
  /** Pan: the press point; pinch: the two fingers' middle, as shares of the box. */
  from: [number, number];
  /** Where the press started, in px, for the tap slop. */
  origin: [number, number];
  /** Pinch only: the fingers' first distance, px. */
  distance?: number;
  moved: boolean;
};

/**
 * The office floor plan as an SVG (plan units 0 0 PLAN_W PLAN_H, traced from the office's CAD
 * drawing, north up): the site and both buildings, and every room with its name and specification
 * (or status); the rooms no WAM room takes carry a quiet "Ruang N". A compass in its top-left corner shows north (Limasan's side). It
 * always opens fitted to its box, on a phone too, and zooms and pans like a map: pinch or ctrl/⌘ +
 * wheel, double tap, drag when zoomed, the + / − / fit buttons in its top-right corner (the empty
 * corner of the building), and +, −, 0 and the arrows from the keyboard. WAM rooms the plan has no
 * spot for are listed below.
 */
export function FloorPlan({
  rooms, statusOf, onPick, selectedId, action = "Pilih ruang ini", label, legend = ["free", "busy", "mine", "off"], caption,
  legendLabels, pickable, highlightId, otherSpots = "label", showUnplaced = true, subtitle = "spec", onPickSpot, selectedSpot, emptySpot, chairColors,
}: Props) {
  const byKind = (chairColors ?? (onPickSpot ? "kind" : "status")) === "kind";
  const shadowId = `fp-shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [view, setView] = useState<PlanView>(FIT_VIEW);
  const [unitPx, setUnitPx] = useState<number | undefined>(undefined);
  const [said, setSaid] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const viewRef = useRef<PlanView>(FIT_VIEW);
  const frame = useRef(0);
  const points = useRef(new Map<number, [number, number]>());
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  const apply = (next: PlanView) => { viewRef.current = next; setView(next); };
  /** Goes to a view: animated (200ms) for the buttons and keys, at once for gestures or reduced motion. */
  const go = (target: PlanView, animate = true) => {
    cancelAnimationFrame(frame.current);
    const to = clampView(target), from = viewRef.current;
    if (!animate || reducedMotion()) { apply(to); return; }
    const begun = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - begun) / 200), ease = 1 - (1 - k) ** 3;
      const mix = (a: number, b: number) => a + (b - a) * ease;
      apply(k < 1 ? clampView({ scale: mix(from.scale, to.scale), x: mix(from.x, to.x), y: mix(from.y, to.y) }) : to);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  const zoomBy = (factor: number, at?: [number, number]) => {
    const next = zoomView(viewRef.current, factor, at);
    go(next);
    setSaid(next.scale <= ZOOM_MIN ? "Denah pas layar" : `Denah diperbesar ${zoomWords(next.scale)}`);
  };
  const fit = () => { go(FIT_VIEW); setSaid("Denah pas layar"); };

  // The plan's size on screen (for readable text), and the native listeners React makes passive:
  // ctrl/⌘ + wheel (and a trackpad pinch) zooms instead of zooming the page, and a two-finger
  // touch, or any touch while zoomed, is the plan's rather than the page's.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => { const width = element.clientWidth; if (width > 0) setUnitPx(width / PLAN_W); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const delta = Math.max(-60, Math.min(60, event.deltaY * (event.deltaMode === 1 ? 16 : 1)));
      go(zoomView(viewRef.current, Math.exp(-delta * 0.01), [(event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height]), false);
    };
    const onTouchMove = (event: TouchEvent) => { if (event.touches.length > 1 || viewRef.current.scale > ZOOM_MIN) event.preventDefault(); };
    const onGesture = (event: Event) => event.preventDefault();
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    // Safari's own pinch events.
    element.addEventListener("gesturestart", onGesture);
    return () => {
      observer?.disconnect();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("gesturestart", onGesture);
      cancelAnimationFrame(frame.current);
    };
    // `go` only reads refs; the listeners are set once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = (x: number, y: number): [number, number] => {
    const bounds = box.current?.getBoundingClientRect();
    return bounds && bounds.width > 0 ? [(x - bounds.left) / bounds.width, (y - bounds.top) / bounds.height] : [0.5, 0.5];
  };
  const middle = () => {
    const [a, b] = [...points.current.values()];
    return { at: share((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), distance: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
  };
  const capture = (id: number) => { try { box.current?.setPointerCapture(id); } catch { /* the pointer is gone */ } };

  function onPointerDown(event: ReactPointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelAnimationFrame(frame.current);
    swallowClick.current = false;
    points.current.set(event.pointerId, [event.clientX, event.clientY]);
    if (points.current.size === 1) {
      gesture.current = { start: viewRef.current, from: share(event.clientX, event.clientY), origin: [event.clientX, event.clientY], moved: false };
    } else if (points.current.size === 2) {
      const { at, distance } = middle();
      gesture.current = { start: viewRef.current, from: at, origin: [event.clientX, event.clientY], distance, moved: true };
      for (const id of points.current.keys()) capture(id);
    }
  }
  function onPointerMove(event: ReactPointerEvent) {
    const now = gesture.current;
    if (!now || !points.current.has(event.pointerId)) return;
    points.current.set(event.pointerId, [event.clientX, event.clientY]);
    if (now.distance && points.current.size >= 2) {
      const { at, distance } = middle();
      go(moveView(now.start, now.start.scale * distance / now.distance, now.from, at), false);
      return;
    }
    if (!now.moved && Math.hypot(event.clientX - now.origin[0], event.clientY - now.origin[1]) > TAP_SLOP) {
      now.moved = true;
      if (now.start.scale > ZOOM_MIN) capture(event.pointerId);
    }
    if (now.moved && now.start.scale > ZOOM_MIN) go(moveView(now.start, now.start.scale, now.from, share(event.clientX, event.clientY)), false);
  }
  function onPointerEnd(event: ReactPointerEvent) {
    if (!points.current.delete(event.pointerId)) return;
    const now = gesture.current;
    if (!now) return;
    if (points.current.size === 1) {
      // A pinch became a one-finger pan: start it again from where the plan is now.
      const [rest] = [...points.current.values()];
      gesture.current = { start: viewRef.current, from: share(rest[0], rest[1]), origin: rest, moved: true };
      return;
    }
    if (points.current.size > 1) return;
    gesture.current = null;
    if (now.moved) { swallowClick.current = true; lastTap.current = null; return; }
    if (event.type !== "pointerup") return;
    // A second tap close to the first zooms in there; its click does not pick a room again.
    const tap = { at: event.timeStamp, x: event.clientX, y: event.clientY };
    const before = lastTap.current;
    if (before && tap.at - before.at < DOUBLE_TAP_MS && Math.hypot(tap.x - before.x, tap.y - before.y) < DOUBLE_TAP_PX) {
      lastTap.current = null;
      swallowClick.current = true;
      if (viewRef.current.scale < ZOOM_MAX) zoomBy(2, share(tap.x, tap.y));
    } else lastTap.current = tap;
  }
  function onClickCapture(event: ReactMouseEvent) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === "+" || key === "=") zoomBy(ZOOM_STEP);
    else if (key === "-" || key === "_") zoomBy(1 / ZOOM_STEP);
    else if (key === "0") fit();
    else if (event.target === box.current && viewRef.current.scale > ZOOM_MIN && key.startsWith("Arrow")) {
      const step = 0.2;
      const [dx, dy] = key === "ArrowLeft" ? [step, 0] : key === "ArrowRight" ? [-step, 0] : key === "ArrowUp" ? [0, step] : [0, -step];
      go(moveView(viewRef.current, viewRef.current.scale, [0.5, 0.5], [0.5 + dx, 0.5 + dy]));
    } else return;
    event.preventDefault();
  }
  /** Keyboard focus on a room the zoomed plan has off screen brings it into view. */
  const reveal = (rect: Rect) => { if (viewRef.current.scale > ZOOM_MIN) go(revealRect(viewRef.current, rect)); };

  const { placed, others, unplaced } = placeRooms(rooms);
  const canPick = (room: Room, status: Status) => !!onPick && (pickable ? pickable(room, status) : pickableTone(status.tone as PlanTone) || room.id === selectedId);
  const keyed = (run: () => void) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(); }
  };
  const spotButton = (key: string, text: string) => ({ label: `${text}. Ubah spot ini`, onClick: () => onPickSpot?.(key), onKeyDown: keyed(() => onPickSpot?.(key)) });
  const zoomed = view.scale > ZOOM_MIN + 0.001;
  const common = { unitPx, scale: view.scale, onReveal: reveal, shadow: `url(#${shadowId})` };
  const seatsWord = (room: Room) => room.capacity ? `${room.capacity} kursi` : "kapasitas belum diisi";
  const emptyStatus: PlanStatus = emptySpot ?? { tone: "closed", text: "Belum ada ruang" };
  /** The chosen (or ringed) spot: drawn again on top with a blue ring and a dark tooltip. */
  const chosen = ((): { rect: Rect; shape?: Point[]; tip: string } | null => {
    if (onPickSpot) {
      const hit = placed.find(item => item.key === selectedSpot);
      if (hit) return { rect: hit.rect, shape: PLAN_SPOTS[hit.key]?.shape, tip: `${hit.room.name} · ${seatsWord(hit.room)} · ${lower(statusOf(hit.room).text)}` };
      const spot = others.find(item => item.key === selectedSpot);
      if (!spot) return null;
      return { rect: spot.rect, shape: spot.shape, tip: `${spot.label} · ${lower(emptyStatus.text)}` };
    }
    const hit = placed.find(item => item.room.id === selectedId) ?? placed.find(item => item.room.id === highlightId);
    return hit ? { rect: hit.rect, shape: PLAN_SPOTS[hit.key]?.shape, tip: `${hit.room.name} · ${seatsWord(hit.room)} · ${TONE_WORDS[statusOf(hit.room).tone]}` } : null;
  })();
  const legendKeys: LegendKey[] = byKind ? [...(["kindMain", "kindSmall"] as const).filter(key => !legend.includes(key)), ...legend] : legend;

  const otherSpotsDrawn = others.map(spot => {
    const named = isRoomSpot(spot.key);
    const drawn = spotShape(spot);
    // A room's spot keeps its furniture (Limasan's stage, the lounge's sofas) even with no WAM room in it.
    const seats = named && !spot.bare ? { capacity: null, layout: spot.layout, round: spot.round } : undefined;
    if (onPickSpot) {
      const empty = emptyStatus;
      // Every spot is named ("Vasuki", "Ruang 12"), so the super admin can give it a room by hand.
      return <Spot key={spot.key} {...common} {...drawn} seats={seats} name={spot.label} sub={empty.text}
        tone={empty.tone} selected={spot.key === selectedSpot} title={`${spot.label} · ${empty.text}`}
        button={spotButton(spot.key, `${spot.label}, ${lower(empty.text)}`)} />;
    }
    const name = otherSpots === "label" ? spot.label : "";
    return <Spot key={spot.key} {...common} {...drawn} seats={seats} name={name} sub="" tone="off" plain faint={!named} title={name} />;
  });
  const placedDrawn = placed.map(({ key, room, rect }) => {
    const status = statusOf(room);
    // On the plan the line under the name is how many chairs it has; people and facilities are in the tooltip.
    const spec = roomSpec(room), seatsLine = roomSeats(room);
    const spot = PLAN_SPOTS[key];
    const seats = spot?.bare ? undefined : { capacity: room.capacity, layout: spot?.layout ?? "rapat", round: spot?.round };
    // The same grouping as the admin's room list: a main room for at most 4 people is a small room.
    const kind: SpotProps["kind"] = byKind ? (roomGroup(room) === "kecil" ? "kindSmall" : "kindMain") : undefined;
    const drawn = { ...(spot ? spotShape(spot) : { rect }), seats, kind, chip: TAKEN_CHIP[status.tone], main: room.kind === "utama" };
    if (onPickSpot) {
      return <Spot key={key} {...common} {...drawn} name={room.name} sub={subtitle === "status" ? status.text : seatsLine} tone={status.tone}
        selected={key === selectedSpot} title={`${room.name} · ${spec} · ${status.text}`}
        button={spotButton(key, `${room.name}, ${lower(status.text)}`)} />;
    }
    const selected = room.id === selectedId;
    const pick = canPick(room, status);
    const sub = subtitle === "status" ? (selected ? `Dipilih · ${status.text}` : status.text) : seatsLine;
    return <Spot key={key} {...common} {...drawn} name={room.name} sub={sub} tone={status.tone} selected={selected}
      ring={room.id === highlightId} title={`${room.name} · ${spec} · ${status.text}`} a11y={`${room.name}, ${lower(status.text)}`}
      button={pick ? { label: `${room.name}, ${lower(status.text)}. ${action}`, onClick: () => onPick?.(room), onKeyDown: keyed(() => onPick?.(room)) } : undefined} />;
  });

  return <div className={css.plan}>
    <div className={css.stage} onKeyDown={onKeyDown}>
      <div ref={box} className={`${css.viewport} ${zoomed ? css.zoomed : ""}`} style={{ aspectRatio: `${PLAN_W} / ${PLAN_H}` }} tabIndex={0} role="group" aria-label={label}
        aria-roledescription="denah" aria-keyshortcuts="+ - 0"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClickCapture={onClickCapture}>
        <svg className={css.svg} viewBox={`${view.x.toFixed(2)} ${view.y.toFixed(2)} ${(PLAN_W / view.scale).toFixed(2)} ${(PLAN_H / view.scale).toFixed(2)}`}>
          <defs>
            <filter id={shadowId} x="-10%" y="-10%" width="120%" height="125%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" style={{ floodColor: "var(--fp-shadow)" }} />
            </filter>
          </defs>
          <Site />
          {otherSpotsDrawn}
          {placedDrawn}
          <Fixtures />
          {chosen && <Focus {...chosen} view={view} unitPx={unitPx} />}
        </svg>
      </div>
      <Compass />
      <div className={css.controls}>
        <button type="button" className={css.control} aria-label="Perbesar denah" aria-disabled={view.scale >= ZOOM_MAX - 0.001} onClick={() => { if (viewRef.current.scale < ZOOM_MAX) zoomBy(ZOOM_STEP); }}>
          <Plus size={20} aria-hidden />
        </button>
        <button type="button" className={css.control} aria-label="Perkecil denah" aria-disabled={!zoomed} onClick={() => { if (viewRef.current.scale > ZOOM_MIN) zoomBy(1 / ZOOM_STEP); }}>
          <Minus size={20} aria-hidden />
        </button>
        <button type="button" className={css.control} aria-label="Pas layar" aria-disabled={!zoomed} onClick={() => { if (viewRef.current.scale > ZOOM_MIN) fit(); }}>
          <Scan size={20} aria-hidden />
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
    </div>
    {caption ? <p className={css.caption}>{caption}</p> : null}
    {showUnplaced && unplaced.length > 0 && <div className={css.extra} role="group" aria-label="Ruang lain, tidak ada di denah">
      <span>Ruang lain</span>
      {unplaced.map(room => {
        const status = statusOf(room);
        const selected = room.id === selectedId;
        const line = subtitle === "status" ? `${selected ? "Dipilih · " : ""}${status.text}` : roomSpec(room);
        const body = <>{room.name}<small>{line}</small></>;
        return canPick(room, status)
          ? <button key={room.id} type="button" className={css.extraChip} aria-pressed={selected} aria-label={`${room.name}, ${lower(status.text)}. ${action}`} onClick={() => onPick?.(room)}>{body}</button>
          : <span key={room.id} className={css.extraChip}>{body}</span>;
      })}
    </div>}
    <ul className={`${css.legend} ${byKind ? css.kindLegend : ""}`} aria-label="Keterangan warna">
      {legendKeys.map(key => <li key={key}><i className={`${css.swatch} ${css[key]}`} aria-hidden />{legendLabels?.[key] ?? defaultLegend[key]}</li>)}
    </ul>
  </div>;
}

/** What a spot draws of itself, whichever room takes it: its outline, words box, door, divider and floor marks. */
const spotShape = (spot: DrawnSpot) => ({
  rect: spot.rect, shape: spot.shape, textRect: spot.textRect, door: spot.door, divider: spot.divider, marks: spot.marks, open: spot.open,
});

/** Class of each kind of site area. */
const SITE_CLASS: Record<SiteKind, string> = {
  grass: css.grass, water: css.water, road: css.road, walk: css.walk, pave: css.pave, yard: css.yard,
  garden: css.garden, roof: css.roof, ramp: css.ramp, pad: css.pad, deck: css.deck,
};
const LINE_CLASS = { tread: css.tread, board: css.board, ridge: css.ridge, mark: css.mark } as const;

/**
 * The site under the rooms (the trace's grass, river, road, paving, yard, roofs, ramps and
 * gardens, the fountain and the way in): context only, never read out or tapped.
 */
function Site() {
  return <g className={css.site} aria-hidden="true">
    {SITE.map(({ kind, rect, r }, index) => <rect key={index} className={SITE_CLASS[kind]} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={r} />)}
    {SITE_LINES.map(({ kind, d }) => <path key={kind} className={LINE_CLASS[kind]} d={d} />)}
    <circle className={css.fountain} cx={FOUNTAIN.cx} cy={FOUNTAIN.cy} r={FOUNTAIN.r} />
    <polygon className={css.entrance} points={ENTRANCE.arrow.map(point => point.join(",")).join(" ")} />
    <text className={css.entranceText} x={ENTRANCE.label.x} y={ENTRANCE.label.y}>Masuk</text>
  </g>;
}

/**
 * North, up: a small compass that stays in the corner while the plan zooms and pans, so a guest
 * can turn the plan to match the office (Limasan is on the north side).
 */
function Compass() {
  return <div className={css.compass} role="img" aria-label="Kompas: utara ke atas, sisi Limasan" title="Utara ke atas (sisi Limasan)">
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle className={css.compassRing} cx="20" cy="20" r="18" />
      <text className={css.compassN} x="20" y="9.5">U</text>
      <path className={css.needleNorth} d="M20 13.5 L23.6 23 L16.4 23 Z" />
      <path className={css.needleSouth} d="M20 33 L23.6 23 L16.4 23 Z" />
      <circle className={css.compassHub} cx="20" cy="23" r="1.6" />
    </svg>
  </div>;
}

/** Furniture that belongs to no room's chairs: Main Office's desks, stools and inner garden, plants. Never in the way of a tap. */
function Fixtures() {
  return <g className={css.fixtures} aria-hidden="true">
    {FIXTURES.map(({ kind, rect }, index) => kind === "plant"
      ? <g key={index}>
        <circle className={css.plant} cx={rect.x + rect.w / 2} cy={rect.y + rect.h / 2} r={rect.w / 2} />
        <circle className={css.plantLeaf} cx={rect.x + rect.w / 2} cy={rect.y + rect.h / 2} r={rect.w / 4} />
      </g>
      : <rect key={index} className={kind === "desk" ? css.desk : kind === "stool" ? css.stool : css.innerGarden} x={rect.x} y={rect.y} width={rect.w} height={rect.h}
        rx={kind === "stool" ? 3 : kind === "desk" ? 4 : 10} />)}
  </g>;
}

/**
 * The chosen room drawn again on top of the plan: a blue ring on its walls and a dark tooltip above
 * it ("Antareja · 4 kursi · kosong"), sized for the screen at any zoom and kept in view. Read out
 * already by the room itself, so hidden from screen readers.
 */
function Focus({ rect, shape, tip, view, unitPx }: { rect: Rect; shape?: Point[]; tip: string; view: PlanView; unitPx?: number }) {
  const px = (unitPx && unitPx > 0 ? unitPx : 860 / PLAN_W) * view.scale;
  const size = 12.5 / px, padX = 9 / px, height = 26 / px, arrow = 6 / px, gap = 5 / px, edge = 4 / px;
  const viewW = PLAN_W / view.scale, viewH = PLAN_H / view.scale;
  const width = Math.min(tip.length * size * 0.56 + padX * 2, viewW - edge * 2);
  const middle = rect.x + rect.w / 2;
  const x = Math.min(Math.max(middle - width / 2, view.x + edge), view.x + viewW - width - edge);
  const aboveY = rect.y - gap - arrow - height;
  const above = aboveY >= view.y + edge || rect.y + rect.h + gap + arrow + height > view.y + viewH - edge;
  const y = above ? Math.max(aboveY, view.y + edge) : rect.y + rect.h + gap + arrow;
  const tipX = Math.min(Math.max(middle, x + arrow * 2), x + width - arrow * 2);
  const pointer = above
    ? `M${tipX - arrow} ${y + height - 0.5}L${tipX} ${y + height + arrow}L${tipX + arrow} ${y + height - 0.5}Z`
    : `M${tipX - arrow} ${y + 0.5}L${tipX} ${y - arrow}L${tipX + arrow} ${y + 0.5}Z`;
  const outline = (className: string) => shape
    ? <polygon className={className} points={shape.map(point => point.join(",")).join(" ")} />
    : <rect className={className} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10} />;
  return <g className={css.focus} aria-hidden="true">
    {outline(css.focusHalo)}
    {outline(css.focusRing)}
    <g className={css.tip}>
      <rect x={x} y={y} width={width} height={height} rx={height / 2.4} />
      <path d={pointer} />
      <text x={x + width / 2} y={y + height / 2} fontSize={size.toFixed(2)}>{tip}</text>
    </g>
  </g>;
}

type SpotProps = {
  rect: Rect;
  /** The outline to draw instead of `rect` (Main Office's L). */
  shape?: Point[];
  /** Where the words (and chairs) sit, when not `rect` (the L's full-width arm, the pantry beside its counter). */
  textRect?: Rect;
  /** A break in the wall: its door. */
  door?: [Point, Point];
  /** A dashed line where a partition can split the room (Vasuki). */
  divider?: [Point, Point];
  /** Lines on its floor (Limasan's roof), as a path. */
  marks?: string;
  /** An open area (Communal Space): a dashed edge, no shadow. */
  open?: boolean;
  /** A quiet name ("Ruang 12") that shows only once readable at this zoom; not read out. */
  faint?: boolean;
  /** Chairs drawn from the capacity, the words then at the top; without it the words sit in the middle. */
  seats?: { capacity: number | null; layout: SeatLayout; round?: boolean };
  name: string;
  /** The line under the name: the room's chairs or its status; "" for none. */
  sub: string;
  tone: Status["tone"];
  /** Chairs coloured by the kind of room rather than its status. */
  kind?: "kindMain" | "kindSmall";
  /** A small tag on the room ("Terpakai"), unless its status line already says it. */
  chip?: string;
  /** The tooltip: name, specification and status. */
  title: string;
  /** Read out when the spot is not a button; by default its name and its tooltip. */
  a11y?: string;
  main?: boolean; selected?: boolean;
  /** Ringed, its words unchanged. */
  ring?: boolean;
  /** Building context only: no status, not read out as a room (unless it is named). */
  plain?: boolean;
  /** The name in the quieter subtitle style ("Spot kosong" on an unnamed spot). */
  quiet?: boolean;
  button?: { label: string; onClick: () => void; onKeyDown: (event: KeyboardEvent) => void };
  unitPx?: number;
  scale: number;
  onReveal: (rect: Rect) => void;
  /** The soft shadow under a room's floor (an SVG filter url). */
  shadow?: string;
};

/** Whether focus came from the keyboard (a tap on a room must not pan the plan under the finger). */
function keyboardFocus(element: Element) {
  try { return element.matches(":focus-visible"); } catch { return false; }
}

/**
 * One spot: its floor (or outline) and door, its furniture and chairs, its name and, once readable
 * at this zoom, its subtitle. With chairs, the words sit at the top and the chairs below them; the
 * chairs are two paths (seats, backrests) coloured by the spot's status or kind.
 */
function Spot({ rect, shape, textRect, door, divider, marks, open, faint, seats, name, sub, tone, kind, chip, title, a11y, main, selected, ring, plain, quiet, button, unitPx, scale, onReveal, shadow }: SpotProps) {
  // An L-shaped room keeps its words in its full-width arm, so they stay inside the L.
  const textBox = textRect ?? rect;
  const capacity = seats?.capacity ?? null, layout = seats?.layout, round = !!seats?.round;
  const { text, band, furniture, chairs } = useMemo(() => {
    if (!layout) return { text: spotText({ name, sub, rect: textBox, main, unitPx }), band: 0, furniture: null, chairs: null };
    const words = spotWords({ name, sub, rect: textBox, main, unitPx });
    // Planned at seating's size in a box 1/SEAT_SCALE as big, and drawn shrunk back (below).
    const k = 1 / SEAT_SCALE;
    const plan = seatPlan({ box: { x: textBox.x * k, y: textBox.y * k, w: textBox.w * k, h: textBox.h * k }, capacity, layout, round, top: words.band * k });
    return { text: words, band: words.band, furniture: plan, chairs: plan.drawn ? chairPaths(plan.chairs) : null };
  }, [name, sub, textBox, main, unitPx, capacity, layout, round]);

  const showSub = text.sub.length > 0 && scale >= text.subFrom;
  const nameGap = text.nameSize * 1.2, subGap = text.subSize * 1.2;
  const height = text.name.length * nameGap + (showSub ? text.subSize * 0.5 + text.sub.length * subGap : 0);
  const cx = textBox.x + textBox.w / 2;
  // At the top when chairs are drawn (turned words centred in their band), else in the middle.
  const cy = layout ? textBox.y + WORDS_TOP + (text.rotate ? (band - WORDS_TOP - WORDS_BOTTOM) / 2 : height / 2) : textBox.y + textBox.h / 2;
  const top = cy - height / 2;
  const floorTone = tone === "off" || tone === "closed" || open;
  const quietText = faint ? quietName(name, textBox, (unitPx && unitPx > 0 ? unitPx : 860 / PLAN_W) * scale) : null;
  const className = [css.spot, css[tone], kind ? css[kind] : "", main ? css.main : "", selected ? css.selected : "", ring ? css.ring : "", plain ? css.plain : "",
    open ? css.open : "", faint ? css.faint : "", button ? css.click : ""].join(" ");
  const attributes = button
    ? { role: "button", tabIndex: 0, "aria-label": button.label, "aria-pressed": !!(selected || ring), onClick: button.onClick, onKeyDown: button.onKeyDown, onFocus: (event: FocusEvent<SVGGElement>) => { if (keyboardFocus(event.currentTarget)) onReveal(rect); } }
    : plain && (!name || faint) ? { "aria-hidden": true } : { role: "img", "aria-label": a11y ?? (plain ? `${name}, bukan ruang booking` : title.replace(/ · /g, ", ")) };

  // The tag sits at the room's foot, readable but never wider than a sixth of the room.
  const chipShown = !!chip && !(showSub && sub.startsWith(chip));
  const chipSize = Math.min(Math.max(14, 9 / (unitPx && unitPx > 0 ? unitPx : 860 / PLAN_W)), textBox.w / 6);
  const chipW = (chip?.length ?? 0) * chipSize * 0.62 + chipSize * 1.1, chipH = chipSize * 1.6;

  return <g className={className} {...attributes}>
    {title && <title>{title}</title>}
    {shape
      ? <polygon className={css.box} points={shape.map(point => point.join(",")).join(" ")} filter={plain || floorTone ? undefined : shadow} />
      : <rect className={css.box} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10} filter={plain || floorTone ? undefined : shadow} />}
    {marks && <path className={css.marks} d={marks} />}
    {divider && <line className={css.divider} x1={divider[0][0]} y1={divider[0][1]} x2={divider[1][0]} y2={divider[1][1]} />}
    {door && <line className={css.door} x1={door[0][0]} y1={door[0][1]} x2={door[1][0]} y2={door[1][1]} />}
    {furniture && <g className={css.furniture} aria-hidden="true" transform={`scale(${SEAT_SCALE})`}>
      {furniture.rug && <rect className={css.rug} x={furniture.rug.x} y={furniture.rug.y} width={furniture.rug.w} height={furniture.rug.h} rx={12} />}
      {furniture.stage && <rect className={css.stageBlock} x={furniture.stage.x} y={furniture.stage.y} width={furniture.stage.w} height={furniture.stage.h} rx={4} />}
      {furniture.sofas.map((sofa, index) => <rect key={index} className={css.sofa} x={sofa.x} y={sofa.y} width={sofa.w} height={sofa.h} rx={9} />)}
      {furniture.table && <rect className={css.wood} x={furniture.table.x} y={furniture.table.y} width={furniture.table.w} height={furniture.table.h} rx={layout === "lounge" ? 10 : 6} />}
      {furniture.roundTable && <circle className={css.wood} cx={furniture.roundTable.cx} cy={furniture.roundTable.cy} r={furniture.roundTable.r} />}
      {chairs && <>
        <path className={css.seat} d={chairs.seat} />
        <path className={css.back} d={chairs.back} />
      </>}
    </g>}
    {faint ? quietText && quietText.lines.map((line, index) => <text key={`q${index}`} x={cx} y={textBox.y + textBox.h / 2 + quietText.size * 1.2 * (index + 0.5 - quietText.lines.length / 2)}
      fontSize={quietText.size.toFixed(1)}>{line}</text>)
    : <g transform={text.rotate ? `rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})` : undefined}>
    {scale >= (text.nameFrom ?? 1) && text.name.map((line, index) => <text key={`n${index}`} className={quiet ? css.st : undefined} x={cx} y={top + nameGap * (index + 0.5)} fontSize={text.nameSize.toFixed(1)}>{line}</text>)}
    {showSub && text.sub.map((line, index) => <text key={`s${index}`} className={css.st} x={cx}
      y={top + text.name.length * nameGap + text.subSize * 0.5 + subGap * (index + 0.5)} fontSize={text.subSize.toFixed(1)}>{line}</text>)}
    </g>}
    {chipShown && <g className={css.chip} aria-hidden="true">
      <rect x={cx - chipW / 2} y={textBox.y + textBox.h - chipH - 8} width={chipW} height={chipH} rx={chipH / 2} />
      <text x={cx} y={textBox.y + textBox.h - chipH / 2 - 8} fontSize={chipSize.toFixed(1)}>{chip}</text>
    </g>}
  </g>;
}
