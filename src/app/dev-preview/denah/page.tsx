import { notFound } from "next/navigation";
import { BUILDING, PLAN_H, PLAN_SPOTS, PLAN_W, ROOM_COUNT, roomBox } from "@/lib/pra-wam/floor-plan";

export const dynamic = "force-dynamic";

/** Layout check for the floor plan's spots: every room box with its number, and each named spot's label. */
export default function DevDenahPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const named = Object.entries(PLAN_SPOTS);
  return <div style={{ padding: 16, background: "#fff" }}>
    <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} style={{ width: "100%", maxWidth: 640, border: "1px solid #ccc" }}>
      <rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} fill="#f4f4f4" />
      {Array.from({ length: ROOM_COUNT }, (_, at) => {
        const box = roomBox(at + 1);
        return <g key={at}><rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#e6eefc" stroke="#557" />
          <text x={box.x + 6} y={box.y + 22} fontSize="20" fill="#c00">{at + 1}</text></g>;
      })}
      {named.map(([key, spot]) => <text key={key} x={spot.rect.x + spot.rect.w / 2} y={spot.rect.y + spot.rect.h / 2} fontSize="18" textAnchor="middle" fill="#003">{spot.label}</text>)}
      {named.filter(([, spot]) => spot.marks).map(([key, spot]) => <path key={key} d={spot.marks} stroke="#a60" fill="none" strokeWidth="2" />)}
    </svg>
  </div>;
}
