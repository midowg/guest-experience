import type { ReactNode } from "react";
import { cx } from "../ui/Pressable";
import css from "./shell.module.css";

/**
 * A screen's body under the shell's top bar (prototipe .wam-content): margin 16, sections 24 apart.
 * `flush` drops the side margin (a list or a photo that runs edge to edge).
 */
export function ScreenContent({ children, flush, className }: { children: ReactNode; flush?: boolean; className?: string }) {
  return <div className={cx(css.content, flush && css.contentFlush, className)}>{children}</div>;
}

/** One section of a screen: its header and its content, 8 apart (.wam-section). */
export function ScreenSection({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <section aria-label={label} className={cx(css.section, className)}>{children}</section>;
}

/** Cards or blocks 12 apart (.wam-stack). */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(css.stack, className)}>{children}</div>;
}
