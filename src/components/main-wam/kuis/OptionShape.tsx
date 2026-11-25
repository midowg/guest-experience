/**
 * The four answer shapes (prototipe qA..qD: triangle, diamond, circle, square). With the letter they tell
 * the options apart on every screen (phone, big screen, MC's control), so one colour serves all four and
 * colour is never the cue. Decorative: the letter is written beside it.
 */
export function OptionShape({ index, className }: { index: number; className?: string }) {
  const d = ["M12 3 22 20H2Z", "M12 2 22 12 12 22 2 12Z", "", "M4 4h16v16H4Z"][index];
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {index === 2 ? <circle cx="12" cy="12" r="10" fill="currentColor" /> : <path d={d} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
  </svg>;
}
