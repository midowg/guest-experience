import css from "./screen-loading.module.css";

const Row = ({ widths }: { widths: [string, string] }) => <div className={css.row}>
  <span className={css.dot} />
  <span className={css.lines}><span className={`${css.bar} ${widths[0]}`} /><span className={`${css.bar} ${widths[1]}`} /></span>
</div>;

/**
 * What a WAM screen shows while it loads (each screen's loading.tsx): the frame around it stays as
 * it is (the shared layout), the new tab is already lit, and here only the screen's place is held
 * with soft grey shapes, as an installed app does, instead of the old screen or a full loading page.
 */
export default function ScreenLoading() {
  return <div className={css.screen} role="status" aria-live="polite" aria-label="Memuat halaman">
    <div className={css.head}><span className={`${css.bar} ${css.eyebrow}`} /><span className={`${css.bar} ${css.title}`} /></div>
    <div className={css.hero} />
    <div className={css.pair}>
      <div className={css.card}><span className={`${css.bar} ${css.mid}`} /><Row widths={[css.wide, css.short]} /><Row widths={[css.mid, css.short]} /></div>
      <div className={css.card}><span className={`${css.bar} ${css.short}`} /><Row widths={[css.mid, css.short]} /><Row widths={[css.wide, css.mid]} /></div>
    </div>
  </div>;
}
