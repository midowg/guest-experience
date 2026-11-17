import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { ChevronRight, CircleAlert, CircleCheck, CloudOff, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { IconBox } from "./Card";
import { cx, KitIcon, Pressable, type ActionProps, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./feedback.module.css";

export type BannerTone = "info" | "offline" | "warning" | "error" | "success";
/** Offline = cloud-off everywhere (DESIGN_SYSTEM §0.3; Beranda and Agenda draw the same). */
const BANNER_ICON: Record<BannerTone, IconProp> = { info: Info, offline: CloudOff, warning: TriangleAlert, error: CircleAlert, success: CircleCheck };

/**
 * Banner (DS #39): something the person should know on this screen, pushed in under the top bar
 * (it moves the content down, never covers it). Offline, an important announcement (`href`: the
 * whole banner is a link with ›), a changed time, an error with "Coba lagi". The words carry the
 * meaning; colour and icon only support them. Offline and warnings are read politely, errors at once.
 */
export function Banner({ tone = "info", title, children, icon, action, href, onClick, className }: Pick<ActionProps, "href" | "onClick"> & {
  tone?: BannerTone;
  title?: ReactNode;
  /** The message (Body/Small). */
  children?: ReactNode;
  /** Another icon than the tone's own. */
  icon?: IconProp;
  /** A text button at the end ("Coba lagi"). Not together with href. */
  action?: { label: string; onClick: MouseEventHandler<HTMLButtonElement> };
  className?: string;
}) {
  const role = tone === "error" ? "alert" : tone === "offline" || tone === "warning" ? "status" : undefined;
  const pressable = !!(href || onClick);
  const inner = <>
    <KitIcon icon={icon ?? BANNER_ICON[tone]} />
    <span className={css.bannerText}>
      {title && <span className={css.bannerTitle}>{title}</span>}
      {children && <span className={css.bannerBody}>{children}</span>}
    </span>
    {pressable && <ChevronRight aria-hidden className={css.bannerChevron} />}
  </>;
  if (pressable) return <Pressable href={href} onClick={onClick} className={cx(css.banner, css[tone], className)}>{inner}</Pressable>;
  return <div role={role} className={cx(css.banner, css[tone], className)}>
    {inner}
    {action && <button type="button" className={css.bannerAction} onClick={action.onClick}>{action.label}</button>}
  </div>;
}

/**
 * EmptyState (DS #40): nothing here yet, no connection, permission refused. An icon in a 64 circle,
 * a title, one or two sentences, and at most one action (primary L only when it is the screen's
 * goal, otherwise tonal M). `size="s"` inside a card; `tone="dark"` on Momen.
 */
export function EmptyState({ icon, title, children, action, size = "m", tone = "default", headingLevel = 2, className }: {
  icon?: IconProp;
  title: ReactNode;
  children?: ReactNode;
  /** A Button. */
  action?: ReactNode;
  size?: "m" | "s";
  tone?: "default" | "dark";
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return <div className={cx(css.empty, size === "s" && css.emptySm, tone === "dark" && css.emptyOndark, className)}>
    {icon && <IconBox icon={icon} size={64} round tone={tone === "dark" ? "ondark" : "neutral"} />}
    <Heading className={css.emptyTitle}>{title}</Heading>
    {children && <p className={css.emptyBody}>{children}</p>}
    {action && <div className={css.emptyAction}>{action}</div>}
  </div>;
}

export type SkeletonShape = "line" | "title" | "circle" | "box" | "photo" | "card" | "block";

/**
 * A grey block standing in for content that is loading (DS #41): shimmer, still with reduced
 * motion. Hidden from screen readers; put aria-busy and a label on the region it fills, or use
 * <SkeletonGroup label="Memuat agenda">.
 */
export function Skeleton({ shape = "line", width, height, className, style }: {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return <span aria-hidden className={cx(css.skel, shape !== "block" && css[shape], className)} style={{ width, height, ...style }} />;
}

/** A loading region: busy for assistive tech, with its spoken name. */
export function SkeletonGroup({ label = "Memuat", children, className, style }: { label?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div role="status" aria-busy="true" aria-label={label} className={className} style={style}>{children}<span className={shared.srOnly}>{label}</span></div>;
}

/** Spinner: only for waits over 300 ms that are not a whole section (those get a Skeleton). */
export function Spinner({ size = 24, label }: { size?: 20 | 24; label?: string }) {
  return <span role={label ? "status" : undefined} aria-label={label} style={{ display: "inline-flex" }}>
    <LoaderCircle aria-hidden className={cx(css.spinner, size === 20 && css.spinnerSm, shared.spin)} />
  </span>;
}
