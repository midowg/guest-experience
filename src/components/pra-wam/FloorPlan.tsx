"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import type { Room } from "@/lib/pra-wam/appraisal";
import {
  BUILDING, DECOR, FIT_VIEW, PLAN_H, PLAN_SPOTS, PLAN_W, ZOOM_MAX, ZOOM_MIN, clampView, isRoomSpot, moveView, pickableTone, placeRooms, revealRect, roomSpec,
  spotText, zoomView, type PlanStatus, type PlanTone, type PlanView, type Rect,
} from "@/lib/pra-wam/floor-plan";
import type { DayStatus, DayTone } from "@/lib/pra-wam/room-day";
import css from "./floor-plan.module.css";

export type LegendKey = PlanTone | DayTone | "selected";
const defaultLegend: Record<LegendKey, string> = {
  free: "Kosong", busy: "Terpakai", mine: "Booking kamu", small: "Terlalu kecil", selected: "Dipilih", off: "Tidak bisa dibooking", closed: "Tutup",
  part: "Terpakai sebagian", full: "Penuh",
};
/** A room's status on the plan: for chosen hours (PlanStatus) or a whole day (DayStatus). */
type Status = PlanStatus | DayStatus;

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
 * The office floor plan as an SVG (plan units 0 0 PLAN_W PLAN_H, from "Werkudara Room Booking",
 * north up): the building, the blocks that are not rooms, and every room with its name and
 * specification (or status). A compass in its top-left corner shows north (Limasan's side). It
 * always opens fitted to its box, on a phone too, and zooms and pans like a map: pinch or ctrl/⌘ +
 * wheel, double tap, drag when zoomed, the + / − / fit buttons in its top-right corner (the empty
 * corner of the building), and +, −, 0 and the arrows from the keyboard. WAM rooms the plan has no
 * spot for are listed below.
 */
export function FloorPlan({
  rooms, statusOf, onPick, selectedId, action = "Pilih ruang ini", label, legend = ["free", "busy", "mine", "off"], caption,
  legendLabels, pickable, highlightId, otherSpots = "label", showUnplaced = true, subtitle = "spec", onPickSpot, selectedSpot, emptySpot,
}: Props) {
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
  const common = { unitPx, scale: view.scale, onReveal: reveal };

  return <div className={css.plan}>
    <div className={css.stage} onKeyDown={onKeyDown}>
      <div ref={box} className={`${css.viewport} ${zoomed ? css.zoomed : ""}`} style={{ aspectRatio: `${PLAN_W} / ${PLAN_H}` }} tabIndex={0} role="group" aria-label={label}
        aria-roledescription="denah" aria-keyshortcuts="+ - 0"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClickCapture={onClickCapture}>
        <svg className={css.svg} viewBox={`${view.x.toFixed(2)} ${view.y.toFixed(2)} ${(PLAN_W / view.scale).toFixed(2)} ${(PLAN_H / view.scale).toFixed(2)}`}>
          <rect className={css.building} x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} rx={18} />
          {DECOR.map((rect, index) => <rect key={index} className={css.decor} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={6} />)}
          {others.map(spot => {
            const named = isRoomSpot(spot.key);
            if (onPickSpot) {
              const empty = emptySpot ?? { tone: "closed", text: "Belum ada ruang" };
              // Desks carry no name: only "Spot kosong", so the super admin can still give them a room.
              return <Spot key={spot.key} {...common} rect={spot.rect} shape={spot.shape} textRect={spot.textRect} name={named ? spot.label : empty.text} quiet={!named} sub={named ? empty.text : ""}
                tone={empty.tone} selected={spot.key === selectedSpot} title={named ? `${spot.label} · ${empty.text}` : empty.text}
                button={spotButton(spot.key, named ? `${spot.label}, ${lower(empty.text)}` : empty.text)} />;
            }
            const name = named && otherSpots === "label" ? spot.label : "";
            return <Spot key={spot.key} {...common} rect={spot.rect} shape={spot.shape} textRect={spot.textRect} name={name} sub="" tone="off" plain title={name} />;
          })}
          {placed.map(({ key, room, rect }) => {
            const status = statusOf(room);
            const spec = roomSpec(room);
            const shape = PLAN_SPOTS[key]?.shape, textRect = PLAN_SPOTS[key]?.textRect;
            if (onPickSpot) return <Spot key={key} {...common} rect={rect} shape={shape} textRect={textRect} name={room.name} sub={subtitle === "status" ? status.text : spec} tone={status.tone}
              main={room.kind === "utama"} selected={key === selectedSpot} title={`${room.name} · ${spec} · ${status.text}`}
              button={spotButton(key, `${room.name}, ${lower(status.text)}`)} />;
            const selected = room.id === selectedId;
            const pick = canPick(room, status);
            const sub = subtitle === "status" ? (selected ? `Dipilih · ${status.text}` : status.text) : spec;
            return <Spot key={key} {...common} rect={rect} shape={shape} textRect={textRect} name={room.name} sub={sub} tone={status.tone} main={room.kind === "utama"} selected={selected}
              ring={room.id === highlightId} title={`${room.name} · ${spec} · ${status.text}`} a11y={`${room.name}, ${lower(status.text)}`}
              button={pick ? { label: `${room.name}, ${lower(status.text)}. ${action}`, onClick: () => onPick?.(room), onKeyDown: keyed(() => onPick?.(room)) } : undefined} />;
          })}
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
    <ul className={css.legend} aria-label="Keterangan warna">
      {legend.map(key => <li key={key}><i className={`${css.swatch} ${css[key]}`} aria-hidden />{legendLabels?.[key] ?? defaultLegend[key]}</li>)}
    </ul>
  </div>;
}

/**
 * North, up: a small compass that stays in the corner while the plan zooms and pans, so a guest
 * can turn the plan to match the office (Limasan is on the north side).
 */
function Compass() {
  return <div className={css.compass} role="img" aria-label="Kompas: utara ke atas, sisi Limasan" title="Utara ke atas (sisi Limasan)">
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle className={css.compassRing} cx="20" cy="20" r="18.5" />
      <text className={css.compassN} x="20" y="10.5">U</text>
      <path className={css.needleNorth} d="M20 14 L24.5 25.5 L15.5 25.5 Z" />
      <path className={css.needleSouth} d="M20 35 L24.5 25.5 L15.5 25.5 Z" />
    </svg>
  </div>;
}

type SpotProps = {
  rect: Rect;
  /** The outline to draw instead of `rect` (Main Office's L). */
  shape?: [number, number][];
  /** Where the words sit, when not `rect`'s middle (the L's full-width arm). */
  textRect?: Rect;
  name: string;
  /** The line under the name: the room's specification or its status; "" for none. */
  sub: string;
  tone: Status["tone"];
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
};

/** Whether focus came from the keyboard (a tap on a room must not pan the plan under the finger). */
function keyboardFocus(element: Element) {
  try { return element.matches(":focus-visible"); } catch { return false; }
}

/** One spot: its box (or outline), its name and, once readable at this zoom, its subtitle. */
function Spot({ rect, shape, textRect, name, sub, tone, title, a11y, main, selected, ring, plain, quiet, button, unitPx, scale, onReveal }: SpotProps) {
  // An L-shaped room keeps its words in its full-width arm, so they stay inside the L.
  const textBox = textRect ?? rect;
  const text = spotText({ name, sub, rect: textBox, main, unitPx });
  const showSub = text.sub.length > 0 && scale >= text.subFrom;
  const nameGap = text.nameSize * 1.2, subGap = text.subSize * 1.2;
  const height = text.name.length * nameGap + (showSub ? text.subSize * 0.5 + text.sub.length * subGap : 0);
  const top = textBox.y + textBox.h / 2 - height / 2;
  const cx = textBox.x + textBox.w / 2;
  const className = [css.spot, css[tone], main ? css.main : "", selected ? css.selected : "", ring ? css.ring : "", plain ? css.plain : "", button ? css.click : ""].join(" ");
  const attributes = button
    ? { role: "button", tabIndex: 0, "aria-label": button.label, "aria-pressed": !!(selected || ring), onClick: button.onClick, onKeyDown: button.onKeyDown, onFocus: (event: FocusEvent<SVGGElement>) => { if (keyboardFocus(event.currentTarget)) onReveal(rect); } }
    : plain && !name ? { "aria-hidden": true } : { role: "img", "aria-label": a11y ?? (plain ? `${name}, bukan ruang booking` : title.replace(/ · /g, ", ")) };
  return <g className={className} {...attributes}>
    {title && <title>{title}</title>}
    {shape
      ? <polygon className={css.box} points={shape.map(point => point.join(",")).join(" ")} />
      : <rect className={css.box} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10} />}
    {text.name.map((line, index) => <text key={`n${index}`} className={quiet ? css.st : undefined} x={cx} y={top + nameGap * (index + 0.5)} fontSize={text.nameSize.toFixed(1)}>{line}</text>)}
    {showSub && text.sub.map((line, index) => <text key={`s${index}`} className={css.st} x={cx}
      y={top + text.name.length * nameGap + text.subSize * 0.5 + subGap * (index + 0.5)} fontSize={text.subSize.toFixed(1)}>{line}</text>)}
  </g>;
}
