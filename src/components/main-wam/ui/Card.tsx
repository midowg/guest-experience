import type { AriaAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cx, KitIcon, Pressable, type ActionProps, type IconProp } from "./Pressable";
import css from "./card.module.css";

export type CardVariant = "outline" | "tonal" | "momen" | "emisi" | "wellbeing" | "awarding" | "role" | "accent";

/**
 * Card (DS #19): surface + 1 px line, or tonal; no shadow. A category colour (momen, emisi,
 * awarding, wellbeing) at most once per screen; `role` = the panitia/BOD card; `accent` = the event
 * colour (EventHero-like blocks only). With `href`/`onClick` the whole card is pressable: then put
 * nothing else pressable inside it.
 */
export function Card({ variant = "outline", flush, as = "div", children, className, href, external, onClick, ...aria }: ActionProps & AriaAttributes & {
  variant?: CardVariant;
  /** No padding (lists, photos inside). */
  flush?: boolean;
  /** Element when not pressable. */
  as?: "div" | "article" | "section";
  children: ReactNode;
  className?: string;
}) {
  const pressable = !!(href || onClick);
  return <Pressable href={href} external={external} onClick={onClick} staticAs={as}
    className={cx(css.card, variant !== "outline" && css[variant], flush && css.flush, pressable && css.pressable, className)} {...aria}>
    {children}
  </Pressable>;
}

/** A card's head row: icon box, title and one line, and something at the end (a pill, a button). */
export function CardHead({ icon, iconTone, title, sub, end, className }: {
  icon?: IconProp;
  iconTone?: IconBoxTone;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return <div className={cx(css.head, className)}>
    {icon && <IconBox icon={icon} tone={iconTone} />}
    <div className={css.headText}><span className={css.headTitle}>{title}</span>{sub && <span className={css.headSub}>{sub}</span>}</div>
    {end && <div className={css.headEnd}>{end}</div>}
  </div>;
}

export type IconBoxTone = "neutral" | "primary" | "success" | "warning" | "error" | "momen" | "emisi" | "wellbeing" | "awarding" | "ondark";
const BOX_TONE: Record<IconBoxTone, string | undefined> = {
  neutral: undefined, primary: css.boxPrimary, success: css.boxSuccess, warning: css.boxWarning, error: css.boxError,
  momen: css.boxMomen, emisi: css.boxEmisi, wellbeing: css.boxWellbeing, awarding: css.boxAwarding, ondark: css.boxOndark,
};

/**
 * An icon in a soft box (40 r12, icon 24). Neutral in lists, rows and tiles; a category colour only
 * on its module card; semantic colours only for a status (QA-32). 64/96 round for empty and result
 * screens.
 */
export function IconBox({ icon, tone = "neutral", size = 40, round, smallIcon, className }: {
  icon: IconProp;
  tone?: IconBoxTone;
  size?: 40 | 48 | 64 | 96;
  round?: boolean;
  /** Icon 20 instead of 24 (40 box). */
  smallIcon?: boolean;
  className?: string;
}) {
  return <span className={cx(css.box, BOX_TONE[tone], size !== 40 && css[`b${size}`], round && css.round, smallIcon && css.boxSmIcon, className)} aria-hidden>
    <KitIcon icon={icon} />
  </span>;
}

/**
 * A section's title row (DS #9), with an optional text link at the end ("Lihat semua").
 * `level` sets the heading level (2 by default).
 */
export function SectionHeader({ title, sub, action, level = 2, className }: {
  title: ReactNode;
  sub?: ReactNode;
  action?: { label: string; href?: string; onClick?: ActionProps["onClick"]; icon?: IconProp };
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return <div className={cx(css.section, className)}>
    <div className={css.sectionText}><Heading className={css.sectionTitle}>{title}</Heading>{sub && <p className={css.sectionSub}>{sub}</p>}</div>
    {action && <TextLink href={action.href} onClick={action.onClick} icon={action.icon}>{action.label}</TextLink>}
  </div>;
}

/** A text link with a 44 touch area ("Lihat semua", "Semua"); `chevron` adds › at the end. */
export function TextLink({ children, icon, chevron, className, href, external, onClick, ...aria }: ActionProps & AriaAttributes & { children: ReactNode; icon?: IconProp; chevron?: boolean; className?: string }) {
  return <Pressable href={href} external={external} onClick={onClick} asButton className={cx(css.link, className)} {...aria}>
    <KitIcon icon={icon} />{children}{chevron && <ChevronRight aria-hidden />}
  </Pressable>;
}

/** A 1 px line (DS #25); `inset` 16 or 68 to start after the padding or the icon. */
export function Divider({ inset, className }: { inset?: 16 | 68; className?: string }) {
  return <hr className={cx(css.divider, inset === 16 && css.inset16, inset === 68 && css.inset68, className)} />;
}
