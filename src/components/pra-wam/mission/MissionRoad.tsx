import { missionStops, ROAD, ROAD_PATH, roadPoint } from "@/lib/pra-wam/mission";
import css from "./mission.module.css";

/*
 * Kantor → Villa Cangkringan as a small scene (24 Nov 2026): the office on the left, the road
 * winding to the villa under Merapi, the bus moving along it as missions are done, a stop per
 * mission that lights up, the road behind the bus drawn in brass. The words above it say where
 * the bus is, for those who do not read the picture.
 */
export function MissionRoad({ percent, missions, done, arrived, launched }: { percent: number; missions: number; done: number; arrived: boolean; launched: boolean }) {
  const bus = roadPoint(percent);
  const stops = missionStops(missions);
  const status = arrived ? "Sudah tiba di Villa Cangkringan"
    : !launched ? "Bus siap berangkat pukul 14.30"
    : done >= missions ? "Semua misi selesai · hampir sampai"
    : `Di perjalanan · ${done} dari ${missions} misi selesai`;
  const flip = Math.abs(bus.angle) > 90;
  return <div className={`${css.road} ${arrived ? css.roadArrived : ""}`}>
    <p className={css.roadStatus} aria-live="polite">{status}</p>
    <svg className={css.roadScene} viewBox="0 0 360 150" role="img" aria-label={`Perjalanan dari kantor ke Villa Cangkringan: ${status}`}>
      {/* Merapi and the hills behind the villa */}
      <path className={css.mountain} d="M196 150 L262 46 L274 38 L286 47 L360 132 L360 150 Z" />
      <path className={css.smoke} d="M274 34 C270 26 278 22 274 14 C271 8 278 4 276 0" />
      <path className={css.hill} d="M150 150 C200 112 236 116 280 124 C316 130 340 118 360 112 L360 150 Z" />
      {/* the office */}
      <g className={css.office} transform="translate(8 64)">
        <rect x="0" y="10" width="34" height="46" rx="3" />
        <rect x="34" y="26" width="16" height="30" rx="2" />
        {[0, 1, 2].map(row => [0, 1].map(col => <rect key={`${row}${col}`} className={css.window} x={6 + col * 14} y={18 + row * 12} width="8" height="6" rx="1" />))}
      </g>
      {/* trees along the way */}
      {[[96, 66], [168, 120], [246, 104], [300, 112]].map(([x, y]) => <g key={`${x}`} className={css.tree} transform={`translate(${x} ${y})`}><path d="M0 -16 L7 0 L-7 0 Z" /><rect x="-1.2" y="0" width="2.4" height="4" /></g>)}
      {/* the road, its centre line, and the way already travelled */}
      <path className={css.roadBed} d={ROAD_PATH} pathLength={100} />
      <path className={css.roadLine} d={ROAD_PATH} pathLength={100} />
      <path className={css.roadTrail} d={ROAD_PATH} pathLength={100} style={{ strokeDasharray: `${percent} 100` }} />
      {/* a stop per mission */}
      {stops.map((at, index) => { const point = roadPoint(at); const reached = index < done; return <g key={at} transform={`translate(${point.x} ${point.y})`}>
        <circle className={reached ? css.stopOn : css.stop} r="6" />
        {reached && <path className={css.stopTick} d="M-2.6 0.2 L-0.6 2.2 L2.8 -1.6" />}
      </g>; })}
      {/* the villa */}
      <g className={css.villa} transform={`translate(${ROAD.to[0] + 6} ${ROAD.to[1] - 30})`}>
        <path d="M0 18 L16 4 L32 18 Z" />
        <rect x="4" y="18" width="24" height="16" rx="1.5" />
        <rect className={css.door} x="13" y="24" width="6" height="10" rx="1" />
      </g>
      {/* the bus, heading along the road */}
      <g className={css.busMove} style={{ transform: `translate(${bus.x}px, ${bus.y}px)` }}>
        <g transform={`rotate(${flip ? bus.angle + 180 : bus.angle}) ${flip ? "scale(-1 1)" : ""}`}>
          <g className={launched && !arrived ? css.busBob : undefined} transform="translate(-15 -18)">
            <rect className={css.busBody} x="0" y="0" width="30" height="15" rx="4" />
            {[3, 10.5, 18].map(x => <rect key={x} className={css.busWindow} x={x} y="3" width="5.5" height="5" rx="1" />)}
            <rect className={css.busWindow} x="24.5" y="3" width="3.5" height="7" rx="1" />
            <circle className={css.busWheel} cx="7.5" cy="16" r="2.8" />
            <circle className={css.busWheel} cx="22.5" cy="16" r="2.8" />
          </g>
        </g>
      </g>
    </svg>
    <div className={css.roadEnds}><span><b>Kantor</b> · 14.30</span><span><b>Villa Cangkringan</b> · ±15.15</span></div>
  </div>;
}
