import { ShellChrome } from "@/components/main-wam/shell";
import { SkeletonGroup } from "@/components/main-wam/ui";
import css from "@/components/main-wam/modul/modul.module.css";

/** A01 while it loads: the dark scanner without the camera yet (no flash of the light frame). */
export default function Loading() {
  return <>
    <ShellChrome hideTopBar hideNav />
    <SkeletonGroup label="Membuka kamera" className={css.scan}><span /></SkeletonGroup>
  </>;
}
