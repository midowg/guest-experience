import { fontVars } from "./font";
import { WLM_FULL_NAME, WlmWordmark } from "./Wordmark";
import css from "./wellbeing.module.css";

/*
 * WLM's splash (19 Nov 2026, app/wlm/loading.tsx): shown while a WLM page is fetched, in place of
 * Journey's white page with the blue ring. The same picture as the phone's launch screen
 * (app/wlm/launch): the name in the five dimension colours in the middle, the five bars under it,
 * "Werkudara Life Mode" at the foot, on the app's own background in the person's theme. While it
 * waits a light sweeps across the name and the bars rise one after another, slowly; with reduced
 * motion it simply stays. The background is there from the first paint (no white flash); only the
 * name fades in, a moment later, so a quick page never blinks.
 */

/** The person's Terang / Gelap from WLM's Tema (the same key as context.ts), before the first paint. */
const THEME_KEY = "wellbeing-theme";
const themeBoot = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.currentScript.parentElement.setAttribute("data-theme",t)}catch(e){}`;

export function WlmSplash({ label = "Memuat WLM" }: { label?: string }) {
  return <div className={`${css.tokens} ${css.splash} ${fontVars}`} role="status" aria-live="polite" suppressHydrationWarning>
    <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
    <span className={css.splashGlow} aria-hidden="true"><i /><i /></span>
    <span className={css.splashCenter} aria-hidden="true">
      <WlmWordmark className={css.splashWord} />
      <span className={css.splashBars}>{[0, 1, 2, 3, 4].map(n => <i key={n} style={{ "--n": n } as React.CSSProperties} />)}</span>
    </span>
    <span className={css.splashFoot} aria-hidden="true">{WLM_FULL_NAME}</span>
    <span className="sr-only">{label}</span>
  </div>;
}
