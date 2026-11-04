"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { Room } from "@/lib/pra-wam/appraisal";
import { BUILDING, DECOR, PLAN_H, PLAN_W, fitText, layoutRooms, pickableTone, type PlanStatus, type PlanTone, type Rect } from "@/lib/pra-wam/floor-plan";
import css from "./floor-plan.module.css";

export type LegendKey = PlanTone | "selected";
const legendLabels: Record<LegendKey, string> = {
  free: "Kosong", busy: "Terpakai", mine: "Booking kamu", small: "Terlalu kecil", selected: "Dipilih", off: "Tidak bisa dibooking", closed: "Tutup",
};

type Props = {
  rooms: Room[];
  /** The status line of each WAM room, for the chosen date and hours. */
  statusOf: (room: Room) => PlanStatus;
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
};

/** "Kosong 09.00–10.00" → "kosong 09.00–10.00", for the middle of a sentence. */
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The office floor plan as an SVG (viewBox 0 0 1600 1340, from "Werkudara Room Booking"): the
 * building, the blocks that are not rooms, and every room with its name and status. WAM rooms the
 * plan has no spot for are listed below it. On a phone the plan fits the width; pinch to zoom, or
 * "Perbesar denah" to scroll it at a readable size.
 */
export function FloorPlan({ rooms, statusOf, onPick, selectedId, action = "Pilih ruang ini", label, legend = ["free", "busy", "mine", "off"], caption }: Props) {
  const [zoomed, setZoomed] = useState(false);
  const { placed, others, unplaced } = layoutRooms(rooms);
  const canPick = (room: Room, status: PlanStatus) => !!onPick && (pickableTone(status.tone) || room.id === selectedId);
  const onKey = (room: Room) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick?.(room); }
  };

  return <div className={`${css.plan} ${zoomed ? css.zoomed : ""}`}>
    <div className={css.head}>
      {caption ? <p>{caption}</p> : <span />}
      <button type="button" className={`button button--quiet ${css.zoom}`} aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>
        {zoomed ? <ZoomOut size={18} aria-hidden /> : <ZoomIn size={18} aria-hidden />}{zoomed ? "Perkecil denah" : "Perbesar denah"}
      </button>
    </div>
    <div className={css.scroll}>
      <svg className={css.svg} viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} role="group" aria-label={label}>
        <rect className={css.building} x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} rx={18} />
        {DECOR.map((rect, index) => <rect key={index} className={css.decor} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={6} />)}
        {others.map(spot => <Spot key={spot.key} rect={spot.rect} name={spot.label} status={{ tone: "off", text: "Bukan ruang booking" }} />)}
        {placed.map(({ key, room, rect }) => {
          const status = statusOf(room);
          const selected = room.id === selectedId;
          const pick = canPick(room, status);
          const shown = selected ? { ...status, text: `Dipilih · ${status.text}` } : status;
          return <Spot key={key} rect={rect} name={room.name} status={shown} main={room.kind === "utama"} selected={selected}
            button={pick ? { label: `${room.name}, ${lower(status.text)}. ${action}`, onClick: () => onPick?.(room), onKeyDown: onKey(room) } : undefined} />;
        })}
      </svg>
    </div>
    {unplaced.length > 0 && <div className={css.extra} role="group" aria-label="Ruang lain, tidak ada di denah">
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
      {legend.map(key => <li key={key}><i className={`${css.swatch} ${css[key]}`} aria-hidden />{legendLabels[key]}</li>)}
    </ul>
  </div>;
}

type SpotProps = {
  rect: Rect; name: string; status: PlanStatus; main?: boolean; selected?: boolean;
  button?: { label: string; onClick: () => void; onKeyDown: (event: KeyboardEvent) => void };
};

/** One room: its box, its name and, when the box is tall enough, its status (as renderPlan()). */
function Spot({ rect, name, status, main, selected, button }: SpotProps) {
  const size = fitText(name, rect.w, main ? 46 : 34);
  const small = fitText(status.text, rect.w, main ? 28 : 23) * 0.92;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // The status shows when the box is tall enough (as renderPlan()) and wide enough to keep it readable;
  // otherwise it stays in the tooltip and the label read out.
  const showStatus = rect.h >= size + small + 16 && small >= 18;
  const className = [css.spot, css[status.tone], main ? css.main : "", selected ? css.selected : "", button ? css.click : ""].join(" ");
  const a11y = button
    ? { role: "button", tabIndex: 0, "aria-label": button.label, "aria-pressed": selected, onClick: button.onClick, onKeyDown: button.onKeyDown }
    : { role: "img", "aria-label": `${name}, ${lower(status.text)}` };
  return <g className={className} {...a11y}>
    <title>{`${name} · ${status.text}`}</title>
    <rect className={css.box} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10} />
    <text x={cx} y={showStatus ? cy - small * 0.7 : cy} fontSize={size.toFixed(1)}>{name}</text>
    {showStatus && <text className={css.st} x={cx} y={cy + size * 0.62} fontSize={small.toFixed(1)}>{status.text}</text>}
  </g>;
}
