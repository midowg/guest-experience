import { MapPin } from "lucide-react";
import { BUILDING, PLAN_SPOTS } from "@/lib/pra-wam/floor-plan";
import css from "./coffee.module.css";

const rectProps = (rect: { x: number; y: number; w: number; h: number }) => ({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });

/** The office floor plan of Pra WAM, cropped to the building, with the pantry marked. */
export function PantryMap() {
  const pantry = PLAN_SPOTS.pantry.rect;
  const cx = pantry.x + pantry.w / 2, cy = pantry.y + pantry.h / 2;
  return (
    <svg className={css.map} viewBox={`${BUILDING.x} ${BUILDING.y} ${BUILDING.w} ${BUILDING.h}`} role="img" aria-label="Denah kantor, pantry ditandai">
      <rect {...rectProps(BUILDING)} className={css.mapBuilding} />
      {Object.entries(PLAN_SPOTS).map(([key, spot]) => spot.shape
        ? <polygon key={key} points={spot.shape.map(point => point.join(",")).join(" ")} className={key === "pantry" ? css.mapPantry : css.mapRoom} />
        : <rect key={key} {...rectProps(spot.rect)} className={key === "pantry" ? css.mapPantry : css.mapRoom} />)}
      <g transform={`translate(${cx} ${cy})`} className={css.mapPin}>
        <circle r="150" opacity=".2" />
        <MapPin x={-130} y={-250} width={260} height={260} strokeWidth={2.4} />
      </g>
    </svg>
  );
}
