"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Where a screen's top-bar actions go: the end of the shell's top bar (set by MainWamShell). */
export const ActionsSlotContext = createContext<HTMLElement | null>(null);

/**
 * A screen's buttons at the end of the shell's top bar (0–2: IconButton, or a Chip on Momen):
 *   <ShellActions><IconButton icon={<Share />} label="Bagikan" onClick={…} /></ShellActions>
 * Rendered into the bar drawn by the layout, so the bar itself never reloads. They appear once the
 * screen has loaded in the browser; keep anything essential in the screen itself.
 */
export function ShellActions({ children }: { children: ReactNode }) {
  const slot = useContext(ActionsSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/**
 * Turns parts of the frame off for one screen, read by CSS (:has), so it holds from the first paint
 * with no flash: `hideTopBar` for screens with a bar of their own (the camera, the QR scanner),
 * `hideNav` for a task screen the address does not already mark as one.
 */
export function ShellChrome({ hideTopBar, hideNav }: { hideTopBar?: boolean; hideNav?: boolean }) {
  return <>
    {hideTopBar && <span data-mw-hide-topbar="" hidden />}
    {hideNav && <span data-mw-hide-nav="" hidden />}
  </>;
}
