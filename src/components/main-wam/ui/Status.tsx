import type { ReactNode } from "react";
import { CalendarClock, Check, CircleCheck, CircleX, EyeOff, Lock, User } from "lucide-react";
import { Words } from "@/components/main-wam/i18n";
import { cx, KitIcon, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./status.module.css";

/**
 * A count or a dot on an icon, a tab or a tile (DS #28). Decorative by default: the control it sits
 * on says it in words ("Notifikasi, 3 belum dibaca"). Give `label` when it stands alone.
 */
export function Badge({ count, dot, label, className }: { count?: number; dot?: boolean; label?: string; className?: string }) {
  if (!dot && (!count || count <= 0)) return null;
  const text = !dot && count ? (count > 99 ? "99+" : String(count)) : null;
  return <span className={cx(css.badge, dot && css.dot, className)} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>{text}</span>;
}

export type PillTone = "neutral" | "active" | "success" | "warning" | "error" | "momen" | "emisi" | "awarding" | "onmedia" | "primary";

/**
 * A short status in words (DS #29): 24 tall, never truncated, so keep it to one or two words.
 * Colour never carries the meaning alone: always a word, and an icon or dot where it helps.
 */
export function Pill({ tone = "neutral", icon, dot, pulse, children, className }: {
  tone?: PillTone;
  icon?: IconProp;
  /** A small dot before the words (live, open). */
  dot?: boolean;
  /** The dot breathes (still with reduced motion). */
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx(css.pill, tone !== "neutral" && css[tone], pulse && css.pulse, className)}>
    {dot && <span className={css.pillDot} aria-hidden />}
    <KitIcon icon={icon} />
    {children}
  </span>;
}

/** The statuses the screens use, each with its fixed look and words (prototipe, PANDUAN §6.3). */
export const STATUS_PILLS = {
  live: { tone: "success", dot: true, pulse: true, label: "Sedang berlangsung" },
  next: { tone: "neutral", label: "Berikutnya" },
  notStarted: { tone: "neutral", label: "Belum mulai" },
  done: { tone: "neutral", icon: Check, label: "Selesai" },
  notOpen: { tone: "neutral", icon: Lock, label: "Belum dibuka" },
  open: { tone: "success", dot: true, label: "Dibuka" },
  present: { tone: "success", icon: CircleCheck, label: "Hadir" },
  sent: { tone: "success", icon: Check, label: "Terkirim" },
  approved: { tone: "success", icon: Check, label: "Disetujui" },
  changed: { tone: "warning", icon: CalendarClock, label: "Jam berubah" },
  pending: { tone: "warning", label: "Perlu persetujuan" },
  hidden: { tone: "warning", icon: EyeOff, label: "Disembunyikan" },
  cancelled: { tone: "error", icon: CircleX, label: "Dibatalkan" },
} as const satisfies Record<string, { tone: PillTone; label: string; icon?: IconProp; dot?: boolean; pulse?: boolean }>;

export type SessionStatus = keyof typeof STATUS_PILLS;

/**
 * A preset Pill: <StatusPill status="live" /> reads "Sedang berlangsung" with a breathing dot.
 * `children` replaces the words where the screen adds detail ("Hadir 07.52", "Dibuka · 41 masukan").
 */
export function StatusPill({ status, children, className }: { status: SessionStatus; children?: ReactNode; className?: string }) {
  const preset = STATUS_PILLS[status];
  return <Pill tone={preset.tone} icon={"icon" in preset ? preset.icon : undefined} dot={"dot" in preset ? preset.dot : undefined}
    pulse={"pulse" in preset ? preset.pulse : undefined} className={className}>{children ?? <Words k={`pill.${status}`} />}</Pill>;
}

/** Up to two initials from a call name: "Rani" → "R", "Sari Rahma" → "SR". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toUpperCase();
}

/**
 * A person's initials (or photo) in a circle (DS #26). Decorative by default, as the name is written
 * next to it; pass `label` when it stands alone. 24 shows a person icon when there is no name.
 */
export function Avatar({ name, photo, size = 40, label, className }: {
  name?: string;
  /** Photo address; the initials show while it loads and if it fails. */
  photo?: string | null;
  size?: 24 | 32 | 40 | 48 | 64;
  label?: string;
  className?: string;
}) {
  const text = name ? initials(name) : "";
  return <span className={cx(css.avatar, size !== 40 && css[`a${size}`], className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {text || <User aria-hidden />}
    {/* Over the initials: a photo that fails to load (empty alt) shows nothing, so the initials stay. */}
    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses, shown as they are */}
    {photo && <img src={photo} alt="" loading="lazy" decoding="async" />}
  </span>;
}

/** Text only screen readers read, e.g. ", hari ini" after a tab. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className={shared.srOnly}>{children}</span>;
}
