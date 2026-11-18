"use client";

import type { CSSProperties, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useKnown, useT } from "@/components/main-wam/i18n";
import { cx } from "./Pressable";
import shared from "./shared.module.css";
import css from "./feedback.module.css";

/**
 * A loading region: busy for assistive tech, with its spoken name. The name may be written in
 * Indonesian by the screen ("Memuat agenda"); it is said in the current language when the
 * dictionary has it (translateKnown), otherwise as written.
 */
export function SkeletonGroup({ label, children, className, style }: { label?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const t = useT();
  const known = useKnown();
  const name = label ? known(label) : t("ui.loading");
  return <div role="status" aria-busy="true" aria-label={name} className={className} style={style}>{children}<span className={shared.srOnly}>{name}</span></div>;
}

/** Spinner: only for waits over 300 ms that are not a whole section (those get a Skeleton). */
export function Spinner({ size = 24, label }: { size?: 20 | 24; label?: string }) {
  const known = useKnown();
  const name = label ? known(label) : undefined;
  return <span role={name ? "status" : undefined} aria-label={name} style={{ display: "inline-flex" }}>
    <LoaderCircle aria-hidden className={cx(css.spinner, size === 20 && css.spinnerSm, shared.spin)} />
  </span>;
}
