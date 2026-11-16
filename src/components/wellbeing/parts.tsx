"use client";

import type { ReactNode } from "react";
import { ChevronRight, CloudOff, Hourglass, RefreshCw } from "lucide-react";
import type { WbMyActivity } from "@/lib/wellbeing/app-types";
import type { DimensionId } from "@/lib/wellbeing/rules";
import { activityMeta, activityTitle, dayLabel, initials, num, toneOf } from "./format";
import { activityIcon, Icon } from "./icons";
import css from "./wellbeing.module.css";

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** A grey block in the shape of what is loading. */
export function Sk({ width = "100%", height = 12, radius = 6, style }: { width?: number | string; height?: number; radius?: number; style?: React.CSSProperties }) {
  return <span className={css.sk} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}
/** Skeleton rows the size of activity rows, in a card. */
export function SkRows({ rows = 5, card = true }: { rows?: number; card?: boolean }) {
  return <div className={cx(card && css.card, css.list)} aria-busy="true" aria-label="Memuat">
    {Array.from({ length: rows }, (_, index) => <div key={index} className={css.skRow}>
      <Sk width={40} height={40} radius={12} />
      <span className={css.skLines}><Sk width="62%" /><Sk width="38%" height={10} /></span>
      <Sk width={44} />
    </div>)}
  </div>;
}

/** Nothing loaded and the request failed: what happened and Coba lagi. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className={css.state} role="alert">
    <div className={css.lead} data-dim="social"><CloudOff size={24} aria-hidden="true" /></div>
    <h2 className={css.sub}>Belum bisa dimuat</h2>
    <p>{message}</p>
    <button type="button" className={cx(css.btn, css.btnTonal)} onClick={onRetry}><RefreshCw size={18} aria-hidden="true" />Coba lagi</button>
  </div>;
}

/** Old data on screen, the refresh failed: a quiet line with Coba lagi. */
export function StaleBar({ show, onRetry }: { show: boolean; onRetry: () => void }) {
  if (!show) return null;
  return <div className={css.stale} role="status">
    <span>Belum bisa memperbarui. Yang tampil data terakhir.</span>
    <button type="button" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" />Coba lagi</button>
  </div>;
}

/** Before the database is ready (migrated: false): a calm note instead of empty lists. */
export function Preparing() {
  return <div className={cx(css.card, css.empty)} role="status">
    <div className={cx(css.lead, css.tonePrimary)}><Hourglass size={24} aria-hidden="true" /></div>
    <p><b>Wellbeing sedang disiapkan.</b></p>
    <p style={{ marginTop: 4 }}>Poin, riwayat, dan peringkat muncul di sini setelah siap.</p>
  </div>;
}

export function Empty({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <div className={cx(css.card, css.empty)}>
    <div className={cx(css.lead, css.tonePrimary)}>{icon}</div>
    <div>{children}</div>
    {action}
  </div>;
}

/** A person's round mark: initials on a steady colour. */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" | "xl" }) {
  return <span className={cx(css.avatar, size === "lg" && css.avatarLg, size === "xl" && css.avatarXl)} data-dim={toneOf(name)} aria-hidden="true">{initials(name)}</span>;
}

/** Segmented buttons (one choice), with aria-pressed. */
export function Seg<T extends string>({ label, value, options, onChange, style }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; style?: React.CSSProperties }) {
  return <div className={css.seg} role="group" aria-label={label} style={style}>
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => { if (value !== key) onChange(key); }}>{text}</button>)}
  </div>;
}

/** The points and the review state on the right of an activity row. */
export function PointsTrail({ activity }: { activity: WbMyActivity }) {
  if (activity.status === "rejected") return <span className={cx(css.pill, css.pillErr)}>Ditolak</span>;
  return <>
    <b className={css.pts}>+{num(activity.points)}</b>
    {activity.status === "adjusted" && <span className={cx(css.pill, css.pillWarn)}>Diubah admin</span>}
  </>;
}

export function ActivityLead({ activity, size }: { activity: WbMyActivity; size?: "lg" }) {
  return <span className={cx(css.lead, size === "lg" && css.leadLg)} data-dim={activity.dimension}><Icon of={activityIcon(activity)} size={size === "lg" ? 26 : 22} /></span>;
}

/** One activity in a list; opens its detail. */
export function ActivityRow({ activity, today, withDate = true, onOpen }: { activity: WbMyActivity; today: string; withDate?: boolean; onOpen: (activity: WbMyActivity) => void }) {
  const status = activity.status === "rejected" ? ", ditolak" : activity.status === "adjusted" ? ", diubah admin" : "";
  return <button type="button" className={cx(css.row, css.pressable)} onClick={() => onOpen(activity)}
    aria-label={`${activityTitle(activity)}, ${activityMeta(activity)}${withDate ? `, ${dayLabel(activity.date, today)}` : ""}, ${activity.status === "rejected" ? "0" : `+${num(activity.points)}`} poin${status}`}>
    <ActivityLead activity={activity} />
    <span className={css.rowMain}>
      <span className={css.rowTitle}>{activityTitle(activity)}</span>
      <span className={css.rowMeta}>{activityMeta(activity)}{withDate ? ` · ${dayLabel(activity.date, today)}` : ""}</span>
    </span>
    <span className={css.rowTrail}><PointsTrail activity={activity} /></span>
  </button>;
}

/** A row that leads somewhere (Profil). */
export function NavRow({ lead, title, meta, trail, onClick }: { lead: ReactNode; title: string; meta?: string; trail?: ReactNode; onClick: () => void }) {
  return <button type="button" className={cx(css.row, css.pressable)} onClick={onClick}>
    {lead}
    <span className={css.rowMain}><span className={css.rowTitle}>{title}</span>{meta && <span className={css.rowMeta}>{meta}</span>}</span>
    {trail}
    <ChevronRight size={20} className={css.chev} aria-hidden="true" />
  </button>;
}

export const dimAttr = (dimension: DimensionId | null) => dimension ?? undefined;
