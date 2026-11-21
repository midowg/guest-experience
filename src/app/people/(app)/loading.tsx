import hr from "@/components/hr/hr.module.css";

/** The frame stays; the screen holds its place while it loads: the greeting, the time card, this week. */
export default function HrScreenLoading() {
  return <div className={hr.narrow} aria-busy="true" aria-label="Memuat" style={{ display: "grid", gap: 16, paddingTop: 8 }}>
    <div className={hr.skeleton} style={{ height: 18, width: "40%" }} />
    <div className={hr.skeleton} style={{ height: 38, width: "72%" }} />
    <div className={hr.skeletonCard} style={{ height: 300 }} />
    <div className={hr.skeleton} style={{ height: 120 }} />
  </div>;
}
