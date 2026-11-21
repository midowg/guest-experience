"use client";

import hr from "@/components/hr/hr.module.css";
import { useCopy } from "@/components/hr/lang";

/** The frame stays; the screen holds its place while it loads: the greeting, the sentence, the action, today. */
export default function HrScreenLoading() {
  const { t } = useCopy();
  return <div className={hr.narrow} aria-busy="true" aria-label={t.common.loading} style={{ display: "grid", gap: 16, paddingTop: 8 }}>
    <div className={hr.skeleton} style={{ height: 18, width: "40%" }} />
    <div className={hr.skeleton} style={{ height: 38, width: "72%" }} />
    <div className={hr.skeleton} style={{ height: 64, width: "88%" }} />
    <div className={hr.skeleton} style={{ height: 56 }} />
    <div className={hr.skeletonCard} style={{ height: 120 }} />
  </div>;
}
