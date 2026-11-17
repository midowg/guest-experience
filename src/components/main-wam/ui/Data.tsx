import type { ReactNode } from "react";
import { ChevronRight, CircleCheck, MapPin } from "lucide-react";
import { IconBox } from "./Card";
import { Badge, StatusPill } from "./Status";
import { cx, KitIcon, Pressable, type ActionProps, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./data.module.css";

/**
 * ProgressBar (DS #30) with its label and value above it: role="progressbar" with the numbers and
 * the label as its name, so the value is never colour alone. `thin` 4 high; a module colour on
 * its own module card only.
 */
export function ProgressBar({ value, max = 100, label, valueText, icon, tone = "primary", thin, className }: {
  value: number;
  max?: number;
  /** Spoken name, and shown above the bar unless `hideLabel`. */
  label: string;
  /** Shown at the right ("842 / 1.200 foto") and said instead of the percentage. */
  valueText?: string;
  icon?: IconProp;
  tone?: "primary" | "momen" | "emisi" | "awarding" | "success";
  thin?: boolean;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = Math.round((clamped / safeMax) * 1000) / 10;
  return <div className={cx(css.progressBox, className)}>
    <div className={css.progressHead}>
      <span className={css.progressLabel}><KitIcon icon={icon} />{label}</span>
      {valueText && <span className={css.progressValue} aria-hidden>{valueText}</span>}
    </div>
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={clamped} aria-valuetext={valueText}
      className={cx(css.progress, thin && css.thin, tone !== "primary" && css[tone])}>
      <span className={css.bar} style={{ width: `${percent}%` }} />
    </span>
  </div>;
}

/** Rows of SessionRow joined by one rail (Agenda). */
export function SessionList({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <div role={label ? "group" : undefined} aria-label={label} className={cx(css.sessions, className)}>{children}</div>;
}

export type SessionRowStatus = "upcoming" | "live" | "done" | "cancelled";

/**
 * SessionRow (DS #22): start and end time, the rail, title (≤ 2 lines), place, and a status.
 * `live` lights the row and adds "Sedang berlangsung"; `done` dims it; `cancelled` strikes the title
 * through, says "Dibatalkan" and cannot be opened. `checkedIn` ends the row with a green check
 * ("Sudah absen"). Extra chips (Absen, Jam berubah) go in `extra`.
 */
export function SessionRow({ start, end, title, place, status = "upcoming", checkedIn, extra, href, onClick, className }: Pick<ActionProps, "href" | "onClick"> & {
  start: string;
  end?: string;
  title: ReactNode;
  place?: ReactNode;
  status?: SessionRowStatus;
  checkedIn?: boolean;
  /** Pills or chips under the place. */
  extra?: ReactNode;
  className?: string;
}) {
  const cancelled = status === "cancelled";
  return <Pressable href={cancelled ? undefined : href} onClick={cancelled ? undefined : onClick}
    className={cx(css.session, status === "live" && css.live, status === "done" && css.done, cancelled && css.cancelled, className)}>
    <span className={css.time}>
      <span className={css.start}>{start}</span>
      {end && <span className={css.end}><span className={shared.srOnly}>sampai </span>{end}</span>}
    </span>
    <span className={css.rail} aria-hidden />
    <span className={css.sessionBody}>
      <span className={css.sessionTitle}>{title}</span>
      {place && <span className={css.place}><MapPin aria-hidden /><span>{place}</span></span>}
      {status === "live" && <StatusPill status="live" />}
      {cancelled && <StatusPill status="cancelled" />}
      {extra}
    </span>
    {(checkedIn || ((href || onClick) && !cancelled)) && <span className={css.trail}>
      {checkedIn ? <CircleCheck className={css.ok} role="img" aria-label="Sudah absen" /> : <ChevronRight aria-hidden />}
    </span>}
  </Pressable>;
}

/** The 2 × 2 grid of Kelola shortcuts (panitia, K01). */
export function ShortcutGrid({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <nav aria-label={label} className={cx(css.tiles, className)}>{children}</nav>;
}

/**
 * A Kelola shortcut (§10.7, T41): icon and label in a row, 64 tall, a count on the right. The count
 * is said with the label ("Moderasi, 3 menunggu").
 */
export function ShortcutTile({ icon, label, badge, badgeLabel = "menunggu", href, onClick, className }: Pick<ActionProps, "href" | "onClick"> & {
  icon: IconProp;
  label: string;
  badge?: number;
  /** Word after the count for screen readers. */
  badgeLabel?: string;
  className?: string;
}) {
  return <Pressable href={href} onClick={onClick} asButton className={cx(css.tile, className)} aria-label={badge ? `${label}, ${badge} ${badgeLabel}` : undefined}>
    <IconBox icon={icon} />
    <span className={css.tileLabel}>{label}</span>
    {!!badge && <Badge count={badge} className={css.tileBadge} />}
  </Pressable>;
}

export type PreviewPhoto = { src?: string | null; alt?: string };

/**
 * A photo, or a neutral placeholder while there is none (never a stock photo of people). `tone`
 * 1–6 varies the placeholder. Fills its box (position it from outside).
 */
export function PhotoFill({ photo, tone = 1, className }: { photo?: PreviewPhoto | null; tone?: 1 | 2 | 3 | 4 | 5 | 6; className?: string }) {
  return <span className={cx(shared.ph, shared[`ph${tone}`], className)}>
    {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 addresses from the server, shown as they are */}
    {photo?.src && <img className={shared.photo} src={photo.src} alt={photo.alt ?? ""} loading="lazy" decoding="async" />}
  </span>;
}

/**
 * StackPreview (§10.5): Momen on Beranda: three small tilted photos, "Momen", how many are new,
 * and a tonal "Lihat". The whole row is one link (no second control inside).
 */
export function StackPreview({ photos, title = "Momen", sub, cta = "Lihat", href, onClick, className }: Pick<ActionProps, "href" | "onClick"> & {
  /** Up to three; placeholders fill the rest. Decorative (alt ignored): the words say it. */
  photos: PreviewPhoto[];
  title?: ReactNode;
  /** "12 foto baru". */
  sub?: ReactNode;
  cta?: string;
  className?: string;
}) {
  const three = [0, 1, 2].map(index => photos[index] ?? null);
  return <Pressable href={href} onClick={onClick} className={cx(css.peek, className)}>
    <span className={css.fan} aria-hidden>
      {three.map((photo, index) => <PhotoFill key={index} photo={photo ? { src: photo.src } : null} tone={(index + 2) as 2 | 3 | 4} className={css.fanPhoto} />)}
    </span>
    <span className={css.peekText}><span className={css.peekTitle}>{title}</span>{sub && <span className={css.peekSub}>{sub}</span>}</span>
    <span className={css.peekCta} aria-hidden={href || onClick ? true : undefined}>{cta}</span>
  </Pressable>;
}

export type TextVariant = "display" | "title" | "headline" | "subtitle" | "body" | "body-strong" | "body-long" | "body-small" | "label-lg" | "label" | "caption" | "caption-strong" | "stat-xl" | "stat-l" | "stat-m";
export type TextColor = "1" | "2" | "3" | "primary" | "success" | "warning" | "error" | "on-accent" | "on-accent-2" | "media" | "media-2" | "inverse-2";

/**
 * One of the 15 text styles (DS §2) with a token colour: <Text variant="body-small" color="2">.
 * `as` picks the element (p by default; h1–h3 for headings). `clamp` cuts at two lines, `ellipsis`
 * at one (names, places). Never smaller than 12, never a font size of your own.
 */
export function Text({ variant = "body", color, as = "p", clamp, ellipsis, children, className, id }: {
  variant?: TextVariant;
  color?: TextColor;
  as?: "p" | "span" | "h1" | "h2" | "h3" | "h4" | "div" | "strong";
  clamp?: boolean;
  ellipsis?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const Tag = as;
  return <Tag id={id} className={cx(css[`t-${variant}`], color && css[`c-${color}`], clamp && css.clamp2, ellipsis && css.ellipsis, className)}>{children}</Tag>;
}
