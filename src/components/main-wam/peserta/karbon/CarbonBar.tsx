import { Fragment, type CSSProperties } from "react";
import type { CarbonSourceView } from "@/lib/main-wam/peserta/carbon";
import css from "./karbon.module.css";

const SWATCH = { 1: css.seg1, 2: css.seg2, 3: css.seg3, 4: css.seg4 } as const;
export const swatchClass = (swatch: CarbonSourceView["swatch"]) => SWATCH[swatch];

/** The stacked bar: one segment per source, 2 px apart, colours --mw-chart-emisi-1…3 and, for a person's devices, the gold accent. `tall` = the page's (16), else the tile's (6). */
export function CarbonBar({ sources, tall, label }: { sources: CarbonSourceView[]; tall?: boolean; /** Said in words; without it the bar is decoration (the legend or the rows say it). */ label?: string }) {
  return <div className={`${css.bar} ${tall ? css.barTall : ""}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
    {sources.map(source => <span key={source.key} className={`${css.seg} ${SWATCH[source.swatch]}`} style={{ "--share": source.percent } as CSSProperties} />)}
  </div>;
}

/** The tile's one line after "perkiraan ·": name and percentage, comma apart; it wraps on narrow screens. Words, never colour alone. */
export function CarbonLegend({ sources }: { sources: CarbonSourceView[] }) {
  return <ul className={css.legend}>
    {sources.map(source => <Fragment key={source.key}><li className={css.legendItem}>
      <span className={css.legendName}>{source.title}</span> <span className={css.legendPercent}>{source.percent}%</span>
    </li>{" "}</Fragment>)}
  </ul>;
}
