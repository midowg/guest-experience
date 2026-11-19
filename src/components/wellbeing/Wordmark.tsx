import css from "./wellbeing.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/*
 * The name WLM in the five dimension colours (18 Nov 2026), on its own so the splash (app/wlm/loading.tsx)
 * draws it without the sign-in's code.
 */
export const WLM_NAME = "WLM";
export const WLM_FULL_NAME = "Werkudara Life Mode";

/** The name in the five dimension colours, one colour band across the three letters. `animated`: the entrance. */
export function WlmWordmark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return <span className={cx(css.wlmWord, className)} data-animated={animated || undefined} aria-hidden="true">
    {[...WLM_NAME].map((letter, index) => <span key={index} className={css.wlmLetterBox}>
      <span className={css.wlmLetter} style={{ "--i": index } as React.CSSProperties}>{letter}</span>
    </span>)}
  </span>;
}
