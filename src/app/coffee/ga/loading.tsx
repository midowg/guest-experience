import css from "@/components/coffee/ga/ga.module.css";

/** While the server makes the first screen: the tablet holds its place (the top bar, the orders, the floor plan). */
export default function CoffeeGaLoading() {
  return (
    <div className={`${css.ga} ${css.stage}`} aria-busy="true" aria-label="Memuat Mode GA">
      <div className={css.topbar} />
      <div className={css.home}>
        <div className={css.homeMain}>
          <div className={css.skeleton} style={{ height: 72, width: "50%" }} />
          <div className={css.skeleton} style={{ height: 220 }} />
        </div>
        <div className={css.homeSide}>
          <div className={css.skeleton} style={{ height: 360 }} />
        </div>
      </div>
    </div>
  );
}
