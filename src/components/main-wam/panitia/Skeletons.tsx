import { ScreenContent } from "@/components/main-wam/shell";
import { Card, List, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import css from "./panitia.module.css";

/*
 * loading.tsx of each panitia and BOD screen (inside the frame, which stays): the shape of the
 * screen to come, so nothing jumps when it arrives.
 */

const Days = () => <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--mw-space-8)" }}>
  {[0, 1, 2, 3].map(index => <Skeleton key={index} shape="block" height={56} style={{ borderRadius: "var(--mw-radius-12)" }} />)}
</div>;

const Rows = ({ count, tall = 72 }: { count: number; tall?: number }) => <List inset={16}>
  {Array.from({ length: count }, (_, index) => <div key={index} className={css.skelRow} style={{ minHeight: tall }}>
    <span className={css.skelText}><Skeleton shape="line" width="30%" /><Skeleton shape="line" width={`${60 + (index % 3) * 10}%`} style={{ marginTop: 8 }} /></span>
  </div>)}
</List>;

export function RundownSkeleton() {
  return <ScreenContent><SkeletonGroup label="Memuat rundown"><div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-24)" }}><Days /><Rows count={7} /></div></SkeletonGroup></ScreenContent>;
}

export function AbsenSkeleton() {
  return <ScreenContent><SkeletonGroup label="Memuat absen sesi"><div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-24)" }}>
    <Skeleton shape="block" height={48} style={{ borderRadius: "var(--mw-radius-12)" }} />
    <div className={css.summary}><Skeleton shape="title" width="70%" height={36} /><Skeleton shape="line" height={8} /><Skeleton shape="line" width="45%" /></div>
    <Skeleton shape="block" height={44} style={{ borderRadius: "var(--mw-radius-12)" }} />
    <List>{Array.from({ length: 6 }, (_, index) => <div key={index} className={css.skelRow} style={{ minHeight: 64 }}>
      <Skeleton shape="circle" width={40} height={40} /><span className={css.skelText}><Skeleton shape="line" width="40%" /><Skeleton shape="line" width="65%" style={{ marginTop: 8 }} /></span>
      <Skeleton shape="block" width={112} height={40} style={{ borderRadius: "var(--mw-radius-12)" }} />
    </div>)}</List>
  </div></SkeletonGroup></ScreenContent>;
}

export function AnnounceSkeleton() {
  return <ScreenContent><SkeletonGroup label="Memuat formulir pengumuman"><div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-24)" }}>
    <Skeleton shape="block" height={76} /><Skeleton shape="block" height={140} />
    {[0, 1, 2, 3].map(index => <Skeleton key={index} shape="block" height={72} style={{ borderRadius: "var(--mw-radius-12)" }} />)}
  </div></SkeletonGroup></ScreenContent>;
}

export function ModerationSkeleton() {
  return <ScreenContent><SkeletonGroup label="Memuat moderasi"><div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-24)" }}>
    <Skeleton shape="block" height={44} style={{ borderRadius: "var(--mw-radius-12)" }} />
    {[0, 1, 2].map(index => <Card key={index}><div className={css.report}>
      <Skeleton shape="block" width={96} height={120} style={{ borderRadius: "var(--mw-radius-12)" }} />
      <span className={css.skelText}><Skeleton shape="line" width="80%" /><Skeleton shape="line" width="40%" style={{ marginTop: 12 }} /><Skeleton shape="line" width="60%" style={{ marginTop: 12 }} /></span>
    </div><Skeleton shape="block" height={40} style={{ borderRadius: "var(--mw-radius-12)" }} /></Card>)}
  </div></SkeletonGroup></ScreenContent>;
}

export function KehadiranSkeleton() {
  return <ScreenContent><SkeletonGroup label="Memuat kehadiran"><div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-24)" }}>
    <Days /><div className={css.avg}><Skeleton shape="title" width="60%" height={36} /><Skeleton shape="line" width="35%" /></div><Rows count={5} tall={76} />
  </div></SkeletonGroup></ScreenContent>;
}
