import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import stack from "./momen.module.css";
import camera from "./camera.module.css";
import gallery from "./gallery.module.css";
import mosaic from "./mosaic.module.css";

/*
 * Loading shapes of Momen's screens (loading.tsx), drawn inside the frame that stays: each the
 * shape of its screen, so nothing jumps when it arrives.
 */

/** M01 memuat: Galeri and Mozaik beside the title (audit T-M05), the filter row, the card as a panel with a spinner place, the actions. */
export function StackSkeleton() {
  const chip = { borderRadius: "var(--mw-radius-12)" };
  return <div className={stack.view}>
    <ShellActions>
      <span className={stack.skeletonChips} aria-hidden><Skeleton shape="block" width={81} height={32} style={chip} /><Skeleton shape="block" width={88} height={32} style={chip} /></span>
    </ShellActions>
    <SkeletonGroup label="Memuat momen" style={{ display: "contents" }}>
      <div className={stack.filter}><Skeleton shape="block" height={40} style={{ flex: 1, borderRadius: 999 }} /><Skeleton shape="block" width={128} height={36} style={{ borderRadius: 999 }} /></div>
      <div className={stack.stage}>
        <div className={stack.deck}><div className={stack.deckInner}><div className={stack.pile}><div className={stack.panel} /></div></div></div>
        <p className={stack.hint} />
        <div className={stack.actions}><span /><span className={stack.camera} aria-hidden /><span /></div>
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

/** M05: the filters, then nine grey squares. */
export function GallerySkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat galeri" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton shape="block" height={44} style={{ borderRadius: 12 }} />
      <Skeleton shape="block" width={128} height={36} style={{ borderRadius: 999 }} />
      <div className={gallery.skeletonGrid}>{Array.from({ length: 9 }, (_, index) => <Skeleton key={index} shape="block" />)}</div>
    </SkeletonGroup>
  </ScreenContent>;
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
