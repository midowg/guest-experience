import type { ReactNode } from "react";
import css from "./console.module.css";
import type { ConsoleThemeName } from "./types";

/** The class that fills the --cs-* colours: the admin light set, or the WAM app's --pw-* tokens. */
export const consoleThemeClass = (theme: ConsoleThemeName) => theme === "pw" ? css.themePw : css.themeAdmin;

/**
 * The colours for console components used outside ConsoleShell (ConsoleShell sets them itself).
 * `canvas` also paints the grey page behind.
 */
export function ConsoleTheme({ theme = "admin", canvas = false, className, children }: { theme?: ConsoleThemeName; canvas?: boolean; className?: string; children: ReactNode }) {
  return <div className={[consoleThemeClass(theme), canvas ? css.canvas : "", className ?? ""].filter(Boolean).join(" ")}>{children}</div>;
}
