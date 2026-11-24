import css from "./bod-survey.module.css";

/** A ring for "done out of everyone", the percent inside. */
export function Ring({ value, size = 76 }: { value: number; size?: number }) {
  const r = (size - 10) / 2, length = 2 * Math.PI * r;
  return <svg className={css.ring} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} persen selesai`}>
    <circle cx={size / 2} cy={size / 2} r={r} className={css.ringTrack} />
    <circle cx={size / 2} cy={size / 2} r={r} className={css.ringFill} strokeDasharray={`${(value / 100) * length} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{value}%</text>
  </svg>;
}
