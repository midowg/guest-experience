import type { CSSProperties } from "react";
import { appraisalRules, clockLabel } from "@/lib/pra-wam/appraisal";
import { durationLabel, hourFills, openHours, type DayHold } from "@/lib/pra-wam/room-day";
import css from "./room-meter.module.css";

/**
 * A room's day as a meter on Denah (DS "Bilah tersegmentasi · meter", 5 Nov 2026): "Sisa 13 jam
 * dari 15 jam" and one segment per opening hour, 07.00–22.00, filled blue (gradient.progress) by
 * how much of it is booked. From three quarters taken the fill turns orange, as the calendar's
 * "Hampir penuh" dot.
 */
export function RoomMeter({ date, holds, name }: { date: string; holds: DayHold[]; name: string }) {
  const fills = hourFills(date, holds);
  const total = openHours * 60;
  const taken = Math.round(fills.reduce((sum, fill) => sum + fill, 0) * 60);
  const left = total - taken;
  const crowded = taken >= total * 0.75;
  const words = `Sisa ${durationLabel(left)} dari ${openHours} jam`;
  return <div className={`${css.meter} ${crowded ? css.crowded : ""}`}>
    <div className={css.head}>
      <span className={css.label}>Sisa jam</span>
      <span className={css.value}><strong>{left ? durationLabel(left) : "0 jam"}</strong> dari {openHours} jam</span>
    </div>
    <div className={css.bar} style={{ "--hours": openHours } as CSSProperties} role="meter" aria-label={`Jam kosong ${name}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={left} aria-valuetext={words}>
      {fills.map((fill, index) => <span key={index} className={css.segment}><i style={{ width: `${fill * 100}%`, "--i": index } as CSSProperties} /></span>)}
    </div>
    <div className={css.scale} aria-hidden>
      <span>{clockLabel(appraisalRules.open)}</span><span>{taken ? `${durationLabel(taken)} terbooking` : "Belum ada booking"}</span><span>{clockLabel(appraisalRules.close)}</span>
    </div>
  </div>;
}
