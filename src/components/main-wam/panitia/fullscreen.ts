/*
 * The Fullscreen API with Safari's older names too (an iPad). `enterFullscreen` must run inside a
 * tap; where the browser has none (an iPhone) `canFullscreen` is false and the screen simply fills
 * the window.
 */
type Page = { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null; exitFullscreen?(): Promise<void>; webkitExitFullscreen?(): void };
type Target = { requestFullscreen?(): Promise<void>; webkitRequestFullscreen?(): void };

export const fullscreenOn = () => { const page = document as unknown as Page; return !!(page.fullscreenElement ?? page.webkitFullscreenElement); };
export const canFullscreen = () => { const root = document.documentElement as unknown as Target; return !!(root.requestFullscreen ?? root.webkitRequestFullscreen); };

export function enterFullscreen() {
  const root = document.documentElement as unknown as Target;
  if (fullscreenOn()) return;
  try {
    if (root.requestFullscreen) root.requestFullscreen()?.catch(() => undefined);
    else root.webkitRequestFullscreen?.();
  } catch { /* refused outside a tap: the screen fills the window instead */ }
}

export function leaveFullscreen() {
  const page = document as unknown as Page;
  if (!fullscreenOn()) return;
  try {
    if (page.exitFullscreen) page.exitFullscreen()?.catch(() => undefined);
    else page.webkitExitFullscreen?.();
  } catch { /* already out */ }
}
