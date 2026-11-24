import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import stack from "./momen.module.css";
import camera from "./camera.module.css";
import mosaic from "./mosaic.module.css";

/*
 * Loading shapes of Momen's screens (loading.tsx), drawn inside the frame that stays: each the
 * shape of its screen, so nothing jumps when it arrives.
 */

/** M01 memuat: the camera beside the title (audit T-M05), the card as a panel with a spinner place, the reaction row. */
export function StackSkeleton() {
  return <div className={stack.view}>
    <ShellActions>
      <span className={stack.skeletonChips} aria-hidden><Skeleton shape="block" width={44} height={44} style={{ borderRadius: 999 }} /></span>
    </ShellActions>
    <SkeletonGroup label="Memuat momen" style={{ display: "contents" }}>
      <div className={stack.stage}>
        <div className={stack.deck}><div className={stack.deckInner}><div className={stack.pile}><div className={stack.panel} /></div></div></div>
        <p className={stack.hint} />
        <div className={stack.actions}><Skeleton shape="block" width={296} height={44} style={{ borderRadius: 999, maxWidth: "100%" }} /></div>
      </div>
    </SkeletonGroup>
  </div>;
}

/** The camera: in the app's theme, the viewfinder and the shutter in place. */
export function CameraSkeleton() {
  return <div className={camera.screen} data-momen-camera="">
    <SkeletonGroup label="Menyiapkan kamera" style={{ display: "contents" }}>
      <div className={camera.bar} />
      <div className={camera.stage}><div className={camera.stageInner}><div className={camera.view} /></div></div>
      <div className={camera.dock}><div style={{ height: 36 }} /><div className={camera.controls}><span /><span className={camera.shutter} aria-hidden /><span /></div></div>
    </SkeletonGroup>
  </div>;
}

/** M06 memuat: the canvas as a grey block, a title and a line. */
export function MosaicSkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat mozaik" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Skeleton shape="block" className={mosaic.skel} />
      <Skeleton shape="block" height={56} style={{ borderRadius: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><Skeleton shape="title" width="50%" /><Skeleton width="100%" /></div>
    </SkeletonGroup>
  </ScreenContent>;
}
