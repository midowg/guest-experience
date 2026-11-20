import hr from "@/components/hr/hr.module.css";

/** The frame stays; the page holds its place while it loads: the greeting card, today's two slots, the history. */
export default function HrLoading() {
  return <div className={hr.narrow} aria-busy="true" aria-label="Memuat" style={{ display: "grid", gap: 12 }}>
    <div className={`${hr.skeleton} ${hr.skeletonHero}`} style={{ height: 380 }} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className={hr.skeleton} style={{ height: 120 }} />
      <div className={hr.skeleton} style={{ height: 120 }} />
    </div>
    <div className={hr.skeleton} style={{ height: 200 }} />
  </div>;
}
