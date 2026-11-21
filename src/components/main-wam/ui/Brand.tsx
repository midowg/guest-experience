import type { ElementType, ReactNode } from "react";
import { cx, KitIcon, type IconProp } from "./Pressable";
import type { MotifName } from "./Card";
import css from "./brand.module.css";

/**
 * Eyebrow (prototipe .cap): a small label in capitals with wide letter-spacing, above a title or
 * beside a number ("SELAMAT PAGI", "MISI BERIKUTNYA", "SEDANG BERLANGSUNG"). `tone` "gold" is the
 * accent one (wajib, berikutnya); `icon` puts a gold icon before it. Short: one line, a few words.
 */
export function EyebrowLabel({ children, tone = "muted", large, icon, as: Tag = "span", className }: {
  children: ReactNode;
  tone?: "muted" | "gold" | "ink";
  /** 14 instead of 12 (a section's label). */
  large?: boolean;
  icon?: IconProp;
  as?: ElementType;
  className?: string;
}) {
  return <Tag className={cx(css.eyebrow, tone === "gold" && css.eyebrowGold, tone === "ink" && css.eyebrowInk, large && css.eyebrowLg, icon && css.eyebrowRow, className)}>
    {icon && <KitIcon icon={icon} />}{children}
  </Tag>;
}

/** The live dot (prototipe .pulse): gold, breathing; still with "Kurangi gerak". Decorative. */
export function PulseDot({ className }: { className?: string }) {
  return <span className={cx(css.pulse, className)} aria-hidden />;
}

/**
 * A network motif of the Kit Visual as the screen's or a block's background art. Decorative
 * (aria-hidden, no pointer events); put it first in a positioned parent, content above it. `place`:
 * "bottom" a 300 px band along the bottom, "top" mirrored at the top right, "fill" the whole box.
 * Light and dark art come from the theme. `fade` melts it toward the text (cards).
 */
export function NetworkMotif({ name = "konstelasi", place = "bottom", fade, className }: { name?: MotifName; place?: "bottom" | "top" | "fill"; fade?: boolean; className?: string }) {
  const motif: Record<MotifName, string> = {
    konstelasi: css.motifKonstelasi, kontur: css.motifKontur, sirkuit: css.motifSirkuit, radar: css.motifRadar,
    matriks: css.motifMatriks, orbit: css.motifOrbit, busur: css.motifBusur,
  };
  const where = place === "top" ? css.placeTop : place === "fill" ? css.placeFill : css.placeBottom;
  return <span className={cx(css.motif, motif[name], where, fade && css.motifFade, className)} aria-hidden />;
}

/**
 * Segment dots (prototipe .dots, .seg5): `total` short bars, the first `done` in blue, the next one
 * (`current`, 1-based) in gold, the rest grey. `fill` stretches them across the row (mission progress).
 * An image with `label` for screen readers ("Hari ke-2 dari 4").
 */
export function SegmentDots({ total, current, done, label, fill, className }: {
  total: number;
  /** The lit one, 1-based; 0 or left out: none. */
  current?: number;
  /** How many are finished (blue). Defaults to everything before `current`. */
  done?: number;
  label: string;
  fill?: boolean;
  className?: string;
}) {
  const count = Math.max(0, Math.min(Math.round(total), 24));
  const lit = current ?? 0;
  const finished = done ?? Math.max(lit - 1, 0);
  return <span role="img" aria-label={label} className={cx(css.dots, fill && css.dotsFill, className)}>
    {Array.from({ length: count }, (_, index) => <i key={index} data-on={index + 1 === lit ? "" : undefined} data-done={index < finished ? "" : undefined} />)}
  </span>;
}

/**
 * A big figure in Barlow with a small capital unit ("340 POIN", "12,4 kg CO₂", the countdown).
 * `size` xl 64 (default), l 40, m 24, hero 76; `tone` "gold" colours the figure with the gold ink.
 * Say what it is in words next to it: the figure alone is not a sentence.
 */
export function BigNumber({ value, unit, size = "xl", tone, className }: { value: ReactNode; unit?: ReactNode; size?: "hero" | "xl" | "l" | "m"; tone?: "gold"; className?: string }) {
  return <span className={cx(css.num, size === "l" && css.numL, size === "m" && css.numM, size === "hero" && css.numHero, tone === "gold" && css.numGold, className)}>
    <span className={css.numValue}>{value}</span>{unit && <span className={css.numUnit}>{unit}</span>}
  </span>;
}

/** A small capital label over a Barlow value (prototipe .kv, .tele): "TEMPAT / Aula Utama". Put several in a <KeyValueRow>. */
export function KeyValue({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return <div className={cx(css.kv, className)}><span className={css.kvLabel}>{label}</span><span className={css.kvValue}>{value}</span></div>;
}

/** Key-value tiles side by side, equal width. */
export function KeyValueRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(css.kvRow, className)}>{children}</div>;
}
