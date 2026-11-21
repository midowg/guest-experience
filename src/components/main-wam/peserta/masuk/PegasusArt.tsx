import css from "./masuk.module.css";

/** The gold path through the pegasus (viewBox 474 × 560, as the art): the light that flows along it. */
const PATH = "M6,372 L30,380 L42,380 L66,369 L76,358 L108,350 L132,340 L163,353 L175,344 L195,334 L226,330 L249,316 L259,287 L264,280 L252,279 L247,243 L233,221 L213,216 L215,190 L194,159 L178,142 L172,112 L160,101 L138,78 L128,66 L138,78 L160,101 L172,112 L178,142 L194,159 L215,190 L213,216 L233,221 L247,243 L269,256 L290,263 L314,246 L324,234 L334,222 L344,210 L353,198 L381,179 L383,159 L403,130";

/**
 * The pegasus of dots and lines (public/wam/pegasus-jaringan-*.svg). Both drawings are in the page and
 * the mode picks one by CSS (light for Terang, dark for Gelap), so there is no flash. `flow` adds the
 * moving light along the gold path (Masuk); reduced motion hides it. Decorative.
 */
export function PegasusArt({ flow = false, className }: { flow?: boolean; className?: string }) {
  return <div className={`${css.peg} ${className ?? ""}`} aria-hidden>
    {/* eslint-disable-next-line @next/next/no-img-element -- static SVG art */}
    <img className={css.pegLight} src="/wam/pegasus-jaringan-terang.svg" alt="" />
    {/* eslint-disable-next-line @next/next/no-img-element -- static SVG art */}
    <img className={css.pegDark} src="/wam/pegasus-jaringan-gelap.svg" alt="" />
    {flow && <svg viewBox="0 0 474 560"><path className={css.flow} pathLength={100} d={PATH} /></svg>}
  </div>;
}
