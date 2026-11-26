import css from "@/components/coffee/coffee.module.css";

/** While the server makes the first screen: the column holds its place (the greeting, the quota, the drinks). */
export default function CoffeeLoading() {
  return (
    <div className={css.column} aria-busy="true" aria-label="Memuat WG Coffee">
      <div className={css.main} style={{ paddingTop: 72 }}>
        <div className={css.skeleton} style={{ height: 18, width: "40%" }} />
        <div className={css.skeleton} style={{ height: 34, width: "60%" }} />
        <div className={css.skeleton} style={{ height: 56 }} />
        <div className={css.skeleton} style={{ height: 52 }} />
        <div className={css.grid}>
          <div className={css.skeleton} style={{ height: 220 }} />
          <div className={css.skeleton} style={{ height: 220 }} />
        </div>
      </div>
    </div>
  );
}
