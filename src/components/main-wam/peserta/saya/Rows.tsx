import type { AriaAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cx, KitIcon, Pressable, SrOnly, type ActionProps, type IconProp } from "@/components/main-wam/ui";
import css from "./saya.module.css";

/** A group of rows in one hairline card (prototipe .grp2): the screens' lists of links and settings. */
export function RowGroup({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <div className={cx(css.group, className)} role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}

/**
 * One row (prototipe .srow): the icon bare in blue, the label, an optional line under it, a value and › at the
 * end. A link or a button with `href`/`onClick` (then › by default), a plain row otherwise.
 */
export function Row({ icon, title, sub, value, trailing, chevron, spoken, danger, className, href, external, onClick, ...aria }: ActionProps & AriaAttributes & {
  icon: IconProp;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  /** Said after the row's words, for screen readers only. */
  spoken?: string;
  danger?: boolean;
  className?: string;
}) {
  const pressable = !!(href || onClick);
  const showChevron = chevron ?? pressable;
  return <Pressable href={href} external={external} onClick={onClick} className={cx(css.row, (!!value || !!trailing) && css.hasValue, className)} {...aria}>
    <KitIcon icon={icon} className={css.icon} />
    <span className={css.text}><span className={cx(css.title, danger && css.danger)}>{title}</span>{sub && <span className={css.sub}>{sub}</span>}</span>
    {(value || trailing || showChevron) && <span className={css.end}>
      {value && <span className={css.value}>{value}</span>}
      {trailing}
      {showChevron && <ChevronRight aria-hidden />}
    </span>}
    {spoken && <SrOnly>{`, ${spoken}`}</SrOnly>}
  </Pressable>;
}
