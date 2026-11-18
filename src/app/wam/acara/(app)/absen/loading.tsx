"use client";

import { useT } from "@/components/main-wam/i18n";
import { ShellChrome } from "@/components/main-wam/shell";
import { SkeletonGroup } from "@/components/main-wam/ui";
import css from "@/components/main-wam/modul/modul.module.css";

/** A01 while it loads: the dark scanner without the camera yet (no flash of the light frame). */
export default function Loading() {
  const t = useT();
  return <>
    <ShellChrome hideTopBar hideNav />
    <SkeletonGroup label={t("absen.openingCamera")} className={css.scan}><span /></SkeletonGroup>
  </>;
}
