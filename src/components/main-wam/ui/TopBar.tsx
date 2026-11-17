import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { IconButton } from "./Button";
import { cx, type ActionProps, type IconProp } from "./Pressable";
import css from "./topbar.module.css";

type Common = {
  /** Up to two IconButtons (or a Chip) at the end. */
  actions?: ReactNode;
  /** Dark Momen and camera screens. */
  tone?: "default" | "dark";
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
 *   after it, 0–2 actions. A task screen may use ✕ instead (`backIcon`, `backLabel="Tutup"`).
 * - `variant="home"`: Beranda: greeting, name, "Hari ke-2 dari 4", the bell at the end. No avatar.
 * The page's h1 is in it. Safe area is the shell's job.
 */
export function TopBar(props: Common & (
  | { variant?: "large"; title: ReactNode }
  | { variant: "back"; title: ReactNode; backHref?: string; onBack?: ActionProps["onClick"]; backLabel?: string; backIcon?: IconProp }
  | { variant: "home"; kicker: ReactNode; name: ReactNode; day?: ReactNode }
)) {
  const { actions, tone = "default", sticky, scrolled, className } = props;
  const base = cx(css.bar, sticky && css.sticky, scrolled && css.scrolled, tone === "dark" && css.dark, className);
  if (props.variant === "back") {
    return <header className={cx(base, css.back)}>
      <div className={css.start}>
        {(props.backHref || props.onBack) && <IconButton icon={props.backIcon ?? <ChevronLeft />} label={props.backLabel ?? "Kembali"} href={props.backHref} onClick={props.onBack} />}
      </div>
      <h1 className={css.backTitle}>{props.title}</h1>
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
      {actions && <div className={css.end}>{actions}</div>}
    </header>;
  }
  return <header className={cx(base, css.large)}>
    <h1 className={css.largeTitle}>{props.title}</h1>
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
