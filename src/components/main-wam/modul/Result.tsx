import type { ReactElement, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { IconBox, type IconBoxTone } from "@/components/main-wam/ui";
import { cx } from "@/components/main-wam/ui";
import css from "./modul.module.css";

/**
 * A result screen's head (A02–A05, T02, T03): an icon in a 96 circle, the title, a line under it,
 * and one sentence. `headline` for the quieter Headline 22 title (A05, T03). Server-safe.
 */
export function Result({ icon, tone = "neutral", title, sub, body, headline, center, children, className }: {
  icon: ReactElement<LucideProps>;
  tone?: IconBoxTone;
  title: ReactNode;
  sub?: ReactNode;
  body?: ReactNode;
  headline?: boolean;
  /** Vertically centred in the screen (T02, T03). */
  center?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return <div className={cx(css.result, center && css.resultCenter, className)}>
    <IconBox icon={icon} tone={tone} size={96} round className={css.resultIcon} />
    <h2 className={headline ? css.resultHeadline : css.resultTitle}>{title}</h2>
    {sub ? <p className={css.resultSub}>{sub}</p> : null}
    {body ? <p className={css.resultBody}>{body}</p> : null}
    {children}
  </div>;
}
