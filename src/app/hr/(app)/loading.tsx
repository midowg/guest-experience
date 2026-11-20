import hr from "@/components/hr/hr.module.css";

/** The frame stays; the page holds its place while it loads. */
export default function HrLoading() {
  return <div className={hr.narrow} aria-busy="true" aria-label="Memuat" style={{ display: "grid", gap: 16, width: "100%" }}>
    <div className={hr.skeleton} style={{ height: 180 }} />
    <div className={hr.skeleton} style={{ height: 120 }} />
  </div>;
}
