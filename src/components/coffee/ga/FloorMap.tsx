import { MACHINE_SPOT } from "@/lib/coffee/rooms";
import type { GaState, Status } from "@/lib/coffee/types";
import { BUILDING, PLAN_SPOTS, type Rect } from "@/lib/pra-wam/floor-plan";
import { STATUS } from "./model";
import css from "./ga.module.css";

/* The office floor plan of Pra WAM (src/lib/pra-wam/floor-plan.ts), top part of the building. */

const VIEW = { x: BUILDING.x, y: BUILDING.y, w: BUILDING.w, h: 1175 };
const SHORT: Record<string, string> = { ananta: "Ananta", limasan: "Limasan", vasuki: "Vasuki", communal: "Komunal", pantry: "Pantry" };
/** Tall, narrow rooms read their name upright along the room instead of spilling into neighbours. */
const UPRIGHT = new Set(["communal", "vasuki"]);
const centre = (rect: Rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

/**
 * The meeting rooms Werkudara Coffee serves, each in the colour and the word of its orders today
 * (never colour alone), and the machine in the pantry. With `onPick`, the rooms are buttons.
 */
export function FloorMap({ rooms, statuses = {}, selected, onPick, label }: {
  rooms: GaState["rooms"]; statuses?: Record<string, Status>; selected?: string; onPick?: (spot: string) => void; label: string;
}) {
  const served = rooms.filter(room => PLAN_SPOTS[room.spot]);
  const coffee = new Set<string>(served.map(room => room.spot));
  return (
    <svg className={css.map} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role={onPick ? "group" : "img"} aria-label={label}>
      <rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} className={css.mapBuilding} />
      {Object.entries(PLAN_SPOTS).filter(([key]) => !coffee.has(key) && key !== MACHINE_SPOT).map(([key, spot]) => spot.shape
        ? <polygon key={key} points={spot.shape.map(point => point.join(",")).join(" ")} className={css.mapOther} />
        : <rect key={key} x={spot.rect.x} y={spot.rect.y} width={spot.rect.w} height={spot.rect.h} className={css.mapOther} />)}
      <MapSpot spot={MACHINE_SPOT} name="Pantry" tone="machine" sub="Mesin" />
      {served.map(room => {
        const status = statuses[room.spot];
        const on = selected === room.spot;
        return (
          <MapSpot key={room.spot} spot={room.spot} name={room.name} tone={on ? "selected" : status ? STATUS[status].tone : "room"}
            sub={on ? "Dipilih" : status ? STATUS[status].label : undefined}
            pick={onPick ? { on, onPick: () => onPick(room.spot) } : undefined} />
        );
      })}
    </svg>
  );
}

function MapSpot({ spot, name, tone, sub, pick }: { spot: string; name: string; tone: string; sub?: string; pick?: { on: boolean; onPick: () => void } }) {
  const rect = PLAN_SPOTS[spot].rect;
  const at = centre(rect);
  const pad = 22;
  const body = (
    <>
      {pick && <rect x={rect.x - pad} y={rect.y - pad} width={rect.w + pad * 2} height={rect.h + pad * 2} className={css.mapHit} />}
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} className={css.mapSpot} data-tone={tone} />
      <g transform={UPRIGHT.has(spot) ? `rotate(-90 ${at.x} ${at.y})` : undefined}>
        <text x={at.x} y={sub ? at.y - 4 : at.y + 15} className={css.mapLabel} data-tone={tone}>{SHORT[spot] ?? name.split(" ")[0]}</text>
        {sub && <text x={at.x} y={at.y + 34} className={css.mapSub} data-tone={tone}>{sub}</text>}
      </g>
    </>
  );
  if (!pick) return <g>{body}</g>;
  return (
    <g role="button" tabIndex={0} aria-pressed={pick.on} aria-label={`Pilih ${name}`} className={css.mapButton}
      onClick={pick.onPick} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick.onPick(); } }}>
      {body}
    </g>
  );
}
