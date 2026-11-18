import { ScreenContent } from "@/components/main-wam/shell";
import { Card, List, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import css from "./peserta.module.css";

/*
 * The loading.tsx of agen A's screens (one shape per screen, inside the frame: the bars stay), here
 * so the previews show the very same: Beranda (P01__status#memuat), Agenda (P03__status), Detail
 * sesi, a list screen (Saya, Panduan, Notifikasi, Pengaturan), Kamar, Perjalanan.
 */

export function BerandaSkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat beranda" className={css.skeletonStack}>
      <Card>
        <Skeleton width="30%" />
        <Skeleton shape="title" width="75%" />
        <Skeleton width="45%" />
        <Skeleton shape="block" height={48} />
      </Card>
      <Card>
        <Skeleton shape="title" width="40%" />
        <Skeleton shape="block" height={48} />
      </Card>
    </SkeletonGroup>
  </ScreenContent>;
}

/**
 * Agenda's own shape (audit T-P04): the four day tabs (56 high, in the same bar as the real ones)
 * and rows as tall as SessionRow (72: start and end time, the rail's dot, title and place), so
 * nothing moves when the day comes in.
 */
export function AgendaSkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat agenda" className={css.skeletonStack}>
      <div className={css.dayBar}>
        <div className={`${css.dayTabs} ${css.skeletonTabs}`}>
          {[0, 1, 2, 3].map(day => <Skeleton key={day} shape="block" height={56} />)}
        </div>
      </div>
      <div className={css.skeletonSessions}>
        {[70, 55, 80, 60, 65].map((width, index) => <div key={index} className={css.skeletonSession}>
          <span className={css.skeletonTime}><Skeleton width={40} /><Skeleton width={34} height={12} /></span>
          <span className={css.skeletonDot}><Skeleton shape="circle" width={12} height={12} /></span>
          <span className={css.skeletonBody}><Skeleton width={`${width}%`} height={18} /><Skeleton width={`${width - 25}%`} /></span>
        </div>)}
      </div>
    </SkeletonGroup>
  </ScreenContent>;
}

export function SessionSkeleton({ label = "Memuat detail sesi" }: { label?: string }) {
  return <ScreenContent>
    <SkeletonGroup label={label} className={css.skeletonStack}>
      <div className={css.skeletonRows}>
        <Skeleton width={140} />
        <Skeleton shape="title" width="80%" />
        <Skeleton width="60%" />
        <Skeleton width="50%" />
        <Skeleton shape="block" height={48} />
      </div>
      <Skeleton shape="block" height={120} />
    </SkeletonGroup>
  </ScreenContent>;
}

/** Rows in cards (Saya, Panduan, Notifikasi, Pengaturan): `groups` cards of `rows` rows. */
export function ListSkeleton({ label, groups = [2, 2, 3] }: { label: string; groups?: number[] }) {
  return <ScreenContent>
    <SkeletonGroup label={label} className={css.skeletonStack}>
      {groups.map((rows, group) => <List key={group}>
        {Array.from({ length: rows }, (_, row) => <div key={row} className={css.skeletonListRow}>
          <Skeleton shape="box" width={40} height={40} />
          <span><Skeleton width="55%" /><Skeleton width="35%" /></span>
        </div>)}
      </List>)}
    </SkeletonGroup>
  </ScreenContent>;
}

export function RoomSkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat kamar" className={css.skeletonStack}>
      <Skeleton shape="block" height={260} />
    </SkeletonGroup>
  </ScreenContent>;
}

/** Beranda's Jejak karbon card while its number is counted (as tall as the card, so nothing jumps). */
export function CarbonCardSkeleton() {
  return <SkeletonGroup label="Memuat jejak karbon">
    <Card>
      <span className={css.skeletonCarbon}>
        <Skeleton shape="box" width={44} height={44} />
        <span className={css.skeletonCarbonText}><Skeleton width="55%" /><Skeleton width="80%" /><Skeleton shape="block" height={6} /></span>
        <Skeleton shape="title" width={44} />
      </span>
    </Card>
  </SkeletonGroup>;
}

/** Jejak karbon (E01) while it loads: the main card, the bar and three rows. */
export function CarbonSkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat jejak karbon" className={css.skeletonStack}>
      <Card>
        <Skeleton width="40%" />
        <Skeleton shape="title" width="55%" />
        <Skeleton width="35%" />
      </Card>
      <Skeleton width="45%" />
      <Skeleton shape="block" height={16} />
      <List>
        {[0, 1, 2].map(row => <div key={row} className={css.skeletonListRow}>
          <Skeleton shape="box" width={40} height={40} />
          <span><Skeleton width="55%" /><Skeleton width="35%" /></span>
        </div>)}
      </List>
    </SkeletonGroup>
  </ScreenContent>;
}

export function TravelSkeleton() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat perjalanan" className={css.skeletonStack}>
      <Skeleton shape="block" height={44} />
      <div className={css.skeletonRows}>
        {[60, 80, 50, 40].map((width, index) => <div key={index} className={css.skeletonRow}>
          <Skeleton shape="circle" width={32} height={32} />
          <span><Skeleton width={`${width}%`} /><Skeleton width="30%" /></span>
        </div>)}
      </div>
    </SkeletonGroup>
  </ScreenContent>;
}
