import type { AriaAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { IconBox } from "./Card";
import { cx, Pressable, type ActionProps, type IconProp } from "./Pressable";
import css from "./list.module.css";

/**
 * A card of rows with dividers (DS #23). The dividers start after the icon (68) by default;
 * `inset={16}` for rows without an icon, `inset={0}` for full lines. `plain` drops the card (rows in
 * a sheet); `bleed` takes it to the screen edge inside a padded parent.
 */
export function List({ children, inset = 68, plain, bleed, as = "div", label, className }: {
  children: ReactNode;
  inset?: 68 | 16 | 0;
  plain?: boolean;
  bleed?: boolean;
  /** "ul" when the rows are a list (pass <li>-wrapped rows or ListRow as="li"). */
  as?: "div" | "ul";
  /** Spoken name of the group. */
  label?: string;
  className?: string;
}) {
  const Tag = as;
  return <Tag aria-label={label} className={cx(css.list, inset === 16 && css.inset16, inset === 0 && css.inset0, plain && css.plain, bleed && css.bleed, className)}>{children}</Tag>;
}

/**
 * One row (DS #23): an icon (neutral box) or any leading element (Avatar), a title (≤ 2 lines),
 * an optional line under it, a value, and something at the end (a Pill, a Badge, a Switch, a Text
 * button). A link or a button when it has `href`/`onClick` (then a chevron by default), otherwise a
 * plain row.
 */
export function ListRow({ icon, leading, title, sub, value, trailing, chevron, disabled, className, href, external, onClick, ...aria }: ActionProps & AriaAttributes & {
  icon?: IconProp;
  /** Anything before the text instead of an icon (e.g. <Avatar />). */
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  /** A short value before the end ("Lt. 2", "3 foto"). */
  value?: ReactNode;
  trailing?: ReactNode;
  /** Show › at the end. Default: when the row is a link or button. */
  chevron?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const pressable = !!(href || onClick);
  const showChevron = chevron ?? pressable;
  return <Pressable href={href} external={external} onClick={onClick} disabled={disabled} className={cx(css.row, className)} {...aria}>
    {icon ? <IconBox icon={icon} /> : leading ? <span className={css.lead}>{leading}</span> : null}
    <span className={css.text}><span className={css.title}>{title}</span>{sub && <span className={css.sub}>{sub}</span>}</span>
    {(value || trailing || showChevron) && <span className={css.trail}>
      {value && <span className={css.value}>{value}</span>}
      {trailing}
      {showChevron && <ChevronRight aria-hidden />}
    </span>}
  </Pressable>;
}

/**
 * A BOD Ringkasan row (DS #45, max 4 on the card): icon, title, line, a big value with a small
 * unit, and a status pill under the text. Pressable rows end in ›; without href/onClick it is the
 * static variant (Jejak karbon) with its value still aligned with the others.
 */
export function StatRow({ icon, title, sub, value, unit, status, className, href, external, onClick, ...aria }: ActionProps & AriaAttributes & {
  icon: IconProp;
  title: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
  /** Small unit after the value ("masukan", "t CO₂e"). */
  unit?: ReactNode;
  /** A Pill under the text ("2 perlu persetujuan"). */
  status?: ReactNode;
  className?: string;
}) {
  const pressable = !!(href || onClick);
  return <Pressable href={href} external={external} onClick={onClick} className={cx(css.stat, !pressable && css.statStatic, className)} {...aria}>
    <IconBox icon={icon} />
    <span className={css.statText}>
      <span className={css.statTitle}>{title}</span>
      {sub && <span className={css.statSub}>{sub}</span>}
      {status && <span className={css.statStatus}>{status}</span>}
    </span>
    <span className={css.statEnd}><span className={css.statValue}>{value}{unit && <span className={css.statUnit}>{unit}</span>}</span></span>
    {pressable && <ChevronRight aria-hidden className={css.statChev} />}
  </Pressable>;
}
