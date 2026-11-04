"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Maximize2, ZoomIn } from "lucide-react";
import type { Room } from "@/lib/pra-wam/appraisal";
import { BUILDING, DECOR, PLAN_H, PLAN_W, fitText, pickableTone, placeRooms, type PlanStatus, type PlanTone, type Rect } from "@/lib/pra-wam/floor-plan";
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
  /** The status line of each WAM room, for the chosen date and hours (or the whole day). */
  statusOf: (room: Room) => Status;
  /** Picking a room; without it the plan is view only. */
  onPick?: (room: Room) => void;
  selectedId?: string;
  /** Ends each pickable room's label: "Nagapadma, kosong 09.00–10.00. Pilih ruang ini". */
  action?: string;
  /** Names the plan for screen readers, e.g. "Denah kantor, Rabu 4 Nov 09.00–10.00". */
  label: string;
  legend?: LegendKey[];
  /** A line beside the zoom button, e.g. what a tap does. */
  caption?: ReactNode;
  /** Other words for legend entries, e.g. closed: "Sudah lewat". */
  legendLabels?: Partial<Record<LegendKey, string>>;
  /** Which rooms a tap picks; by default a free or too small room, or the selected one. */
  pickable?: (room: Room, status: Status) => boolean;
  /** Rings this room without changing its words (the Book plan's room whose detail is open). */
  highlightId?: string;
  /** Spots no WAM room takes: named with "Bukan ruang booking" (default), or plain grey context. */
  otherSpots?: "label" | "plain";
  /** Lists the WAM rooms without a spot below the plan (default). */
  showUnplaced?: boolean;
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

/**
 * The office floor plan as an SVG (viewBox 0 0 1600 1340, from "Werkudara Room Booking"): the
 * building, the blocks that are not rooms, and every room with its name and status. WAM rooms the
 * plan has no spot for are listed below it. On a phone the plan opens at a readable size and
 * scrolls sideways like a map, starting from the middle; "Lihat seluruh denah" fits it to the width.
 */
export function FloorPlan({
  rooms, statusOf, onPick, selectedId, action = "Pilih ruang ini", label, legend = ["free", "busy", "mine", "off"], caption,
  legendLabels, pickable, highlightId, otherSpots = "label", showUnplaced = true, onPickSpot, selectedSpot, emptySpot,
}: Props) {
  const [fit, setFit] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Start the phone's wide plan from the middle, where the meeting rooms are.
  useEffect(() => {
    const box = scroller.current;
    if (box && !fit) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
  }, [fit]);
  const { placed, others, unplaced } = placeRooms(rooms);
  const canPick = (room: Room, status: Status) => !!onPick && (pickable ? pickable(room, status) : pickableTone(status.tone as PlanTone) || room.id === selectedId);
  const keyed = (run: () => void) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(); }
  };
  const onKey = (room: Room) => keyed(() => onPick?.(room));
  const spotButton = (key: string, text: string) => ({ label: `${text}. Ubah spot ini`, onClick: () => onPickSpot?.(key), onKeyDown: keyed(() => onPickSpot?.(key)) });

  return <div className={`${css.plan} ${fit ? css.fit : ""}`}>
    <div className={css.head}>
      {caption ? <p>{caption}</p> : <span />}
      <button type="button" className={`button button--quiet ${css.zoom}`} aria-pressed={fit} onClick={() => setFit(!fit)}>
        {fit ? <ZoomIn size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}{fit ? "Perbesar denah" : "Lihat seluruh denah"}
      </button>
    </div>
    {!fit && <p className={css.swipe}>Geser denah ke samping untuk melihat ruang lain.</p>}
    <div className={css.scroll} ref={scroller}>
      <svg className={css.svg} viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} role="group" aria-label={label}>
        <rect className={css.building} x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} rx={18} />
        {DECOR.map((rect, index) => <rect key={index} className={css.decor} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={6} />)}
        {others.map(spot => {
          if (onPickSpot) {
            const empty = emptySpot ?? { tone: "closed", text: "Belum ada ruang" };
            return <Spot key={spot.key} rect={spot.rect} name={spot.label} status={empty} selected={spot.key === selectedSpot}
              button={spotButton(spot.key, `${spot.label}, ${lower(empty.text)}`)} />;
          }
          const plain = otherSpots === "plain";
          return <Spot key={spot.key} rect={spot.rect} name={spot.label} status={{ tone: "off", text: plain ? "" : "Bukan ruang booking" }} plain={plain} />;
        })}
        {placed.map(({ key, room, rect }) => {
          const status = statusOf(room);
          if (onPickSpot) return <Spot key={key} rect={rect} name={room.name} status={status} main={room.kind === "utama"} selected={key === selectedSpot}
            button={spotButton(key, `${room.name}, ${lower(status.text)}`)} />;
          const selected = room.id === selectedId;
          const pick = canPick(room, status);
          const shown = selected ? { ...status, text: `Dipilih · ${status.text}` } : status;
          return <Spot key={key} rect={rect} name={room.name} status={shown} main={room.kind === "utama"} selected={selected} ring={room.id === highlightId}
            button={pick ? { label: `${room.name}, ${lower(status.text)}. ${action}`, onClick: () => onPick?.(room), onKeyDown: onKey(room) } : undefined} />;
        })}
      </svg>
    </div>
    {showUnplaced && unplaced.length > 0 && <div className={css.extra} role="group" aria-label="Ruang lain, tidak ada di denah">
      <span>Ruang lain</span>
      {unplaced.map(room => {
        const status = statusOf(room);
        const selected = room.id === selectedId;
        const body = <>{room.name}<small>{selected ? "Dipilih · " : ""}{status.text}</small></>;
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

type SpotProps = {
  rect: Rect; name: string; status: Status; main?: boolean; selected?: boolean;
  /** Ringed, its words unchanged. */
  ring?: boolean;
  /** Building context only: no status, not read out as a room. */
  plain?: boolean;
  button?: { label: string; onClick: () => void; onKeyDown: (event: KeyboardEvent) => void };
};

/** One room: its box, its name and, when the box is tall enough, its status (as renderPlan()). */
function Spot({ rect, name, status, main, selected, ring, plain, button }: SpotProps) {
  const size = fitText(name, rect.w, main ? 46 : 34);
  const small = fitText(status.text, rect.w, main ? 28 : 23) * 0.92;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // The status shows when the box is tall enough (as renderPlan()) and wide enough to keep it readable;
  // otherwise it stays in the tooltip and the label read out.
  const showStatus = !!status.text && rect.h >= size + small + 16 && small >= 18;
  const className = [css.spot, css[status.tone], main ? css.main : "", selected ? css.selected : "", ring ? css.ring : "", plain ? css.plain : "", button ? css.click : ""].join(" ");
  const a11y = button
    ? { role: "button", tabIndex: 0, "aria-label": button.label, "aria-pressed": !!(selected || ring), onClick: button.onClick, onKeyDown: button.onKeyDown }
    : plain ? { "aria-hidden": true } : { role: "img", "aria-label": `${name}, ${lower(status.text)}` };
  return <g className={className} {...a11y}>
    <title>{status.text ? `${name} · ${status.text}` : name}</title>
    <rect className={css.box} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10} />
    <text x={cx} y={showStatus ? cy - small * 0.7 : cy} fontSize={size.toFixed(1)}>{name}</text>
    {showStatus && <text className={css.st} x={cx} y={cy + size * 0.62} fontSize={small.toFixed(1)}>{status.text}</text>}
  </g>;
}
