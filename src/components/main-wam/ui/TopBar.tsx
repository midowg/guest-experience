import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { IconButton } from "./Button";
import { SegmentDots } from "./Brand";
import { cx, type ActionProps, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./topbar.module.css";

type Common = {
  /** Up to two IconButtons (or a Chip) at the end. */
  actions?: ReactNode;
  /** Sticks to the top while the screen scrolls. */
  sticky?: boolean;
  /** Content scrolled under it: surface background and a bottom line. */
  scrolled?: boolean;
  className?: string;
};

/**
 * TopBar (DS #3), one per screen, at the top of the screen's content:
 * - `variant="large"` (default): a tab's root (Agenda, Momen, Saya): Title 28, actions at the end.
 * - `variant="back"`: a detail or task screen: ‹ (to `backHref`, or `onBack`), the title left-aligned
 *   after it, 0–2 actions. A task screen may use ✕ instead (`backIcon`, `backLabel="Tutup"`). An
 *   empty title draws no heading; `label` then names the screen for screen readers (hidden h1).
 * - `variant="home"`: Beranda: greeting (a small capital label), the name in big capitals, "Hari ke-2 dari 4" (text and/or the segment dots), the bell at the end. No avatar.
 * The page's h1 is in it. Safe area is the shell's job.
 */
export function TopBar(props: Common & (
  | { variant?: "large"; title: ReactNode; /** A small capital label above the title ("AGENDA" over "HARI KE-1"). */ eyebrow?: ReactNode }
  | { variant: "back"; title: ReactNode; backHref?: string; onBack?: ActionProps["onClick"]; backLabel?: string; backIcon?: IconProp;
      /** The screen's name for screen readers when the bar shows no title (P04: "Detail sesi"); without either, no h1 here. */
      label?: string }
  | { variant: "home"; kicker: ReactNode; name: ReactNode; day?: ReactNode;
      /** The event's days as segment dots before the bell ("Hari ke-2 dari 4": current 2, total 4); `label` is what screen readers say. */
      dayDots?: { total: number; current: number; label: string } }
)) {
  const { actions, sticky, scrolled, className } = props;
  const base = cx(css.bar, sticky && css.sticky, scrolled && css.scrolled, className);
  if (props.variant === "back") {
    return <header className={cx(base, css.back)}>
      <div className={css.start}>
        {(props.backHref || props.onBack) && <IconButton icon={props.backIcon ?? <ChevronLeft />} label={props.backLabel ?? "Kembali"} href={props.backHref} onClick={props.onBack} />}
      </div>
      {props.title
        ? <h1 className={css.backTitle}>{props.title}</h1>
        // "Kepala tanpa judul" (revisi 16 Nov): the column stays; the name is for screen readers only, never an empty h1.
        : <span className={css.backTitle}>{props.label && <h1 className={shared.srOnly}>{props.label}</h1>}</span>}
      <div className={css.end}>{actions}</div>
    </header>;
  }
  if (props.variant === "home") {
    return <header className={cx(base, css.home)}>
      <div className={css.homeText}>
        <span className={css.kicker}>{props.kicker}</span>
        <h1 className={css.name}>{props.name}</h1>
        {props.day && <span className={css.day}>{props.day}</span>}
      </div>
      {(actions || props.dayDots) && <div className={css.homeEnd}>
        {props.dayDots && <SegmentDots total={props.dayDots.total} current={props.dayDots.current} label={props.dayDots.label} />}
        {actions && <div className={css.end}>{actions}</div>}
      </div>}
    </header>;
  }
  return <header className={cx(base, css.large)}>
    <div className={css.largeText}>
      {props.eyebrow && <span className={css.eyebrow}>{props.eyebrow}</span>}
      <h1 className={css.largeTitle}>{props.title}</h1>
    </div>
    {actions && <div className={css.end}>{actions}</div>}
  </header>;
}

/**
 * ActionBar (DS #6): the main action of a task screen (absen, form), stuck to the bottom with the
 * safe area under it. Screens with an ActionBar have no bottom nav (the shell's `navHidden`). A
 * short reason may sit above the button (`note`); two buttons side by side go in `row`.
 */
export function ActionBar({ children, note, row, className }: { children: ReactNode; note?: ReactNode; row?: boolean; className?: string }) {
  return <div className={cx(css.actionbar, className)} data-mw-actionbar="">
    {note && <p className={css.actionNote}>{note}</p>}
    {row ? <div className={css.actionRow}>{children}</div> : children}
  </div>;
}
