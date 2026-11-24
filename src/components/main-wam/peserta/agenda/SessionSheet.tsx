"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasTrail } from "@/components/main-wam/shell/trail";
import { Sheet, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import { useT } from "@/components/main-wam/i18n";
import { mainWamPath } from "@/lib/routes";
import { isSessionSheetPath } from "@/lib/main-wam/screen";
import { SessionBody, SessionKicker, type SessionBodyProps } from "./SessionScreen";

/**
 * Detail sesi as a bottom sheet over Agenda (P04, after the prototype): its height follows its content,
 * grows up to almost the screen and then only the content scrolls; the kind of entry and ✕ stay in view, the
 * title is the first thing in the content, large (prototipe .dsh; the kit's Sheet, its own title only a name). It has an address of its own (/wam/acara/agenda/<id>, so a notification or a link opens
 * it, and Back closes it). Opened from inside the app the address is intercepted (the (app)/@sheet slot), so the
 * screen the person was on (Beranda, Agenda, ...) stays exactly as it was and only this sheet opens over it; opened
 * from outside (a link, a reload) the page behind is Agenda of the session's day. Closing goes back when the
 * person came from inside the app, else to that day's Agenda, so closing never leaves the app.
 */
/** Set while the loading twin is on screen, so the real sheet that replaces it does not slide in a second time. */
const UP_FLAG = "__mwSessionSheetUp";

export function SessionSheet({ closeHref, ...body }: Omit<SessionBodyProps, "withTitle"> & { closeHref: string }) {
  const router = useRouter();
  const [instant] = useState(() => typeof window !== "undefined" && (window as unknown as Record<string, unknown>)[UP_FLAG] === true);
  const close = () => { if (hasTrail()) router.back(); else router.replace(closeHref); };
  // history={false}: the address is the entry (opened by navigating to it), so ✕ and Back both just go back.
  return <Sheet open onClose={close} history={false} instant={instant} title={body.view.title} hideTitle kicker={<SessionKicker view={body.view} />}>
    <SessionBody {...body} withTitle={false} />
  </Sheet>;
}

/**
 * Detail sesi while its data loads (the route's loading UI): the sheet is already up, its body a skeleton,
 * so a tap on a session answers at once; the real sheet takes its place without sliding in again.
 */
export function SessionSheetLoading({ onClose }: { /** The sheet is opening before its address has answered (SessionSheetPending): ✕ only drops it. */ onClose?: () => void } = {}) {
  const router = useRouter();
  const t = useT();
  const [instant] = useState(() => typeof window !== "undefined" && (window as unknown as Record<string, unknown>)[UP_FLAG] === true);
  useEffect(() => {
    const flags = window as unknown as Record<string, unknown>;
    flags[UP_FLAG] = true;
    return () => { setTimeout(() => { flags[UP_FLAG] = false; }, 1500); };
  }, []);
  const close = () => { if (onClose) onClose(); else if (hasTrail()) router.back(); else router.replace(mainWamPath.agenda()); };
  return <Sheet open onClose={close} history={false} instant={instant} title={t("peserta.session.loading")} hideTitle>
    <SkeletonGroup label={t("peserta.session.loading")} style={{ display: "grid", gap: "var(--mw-space-12)", justifyItems: "start" }}>
      <Skeleton width={96} height={14} />
      <Skeleton width={240} height={40} />
      <Skeleton width={160} height={16} />
      <Skeleton width={200} height={16} />
      <Skeleton shape="block" height={72} />
      <Skeleton shape="block" height={52} />
    </SkeletonGroup>
  </Sheet>;
}

/** A tap on a link to Detail sesi (not a new tab, not a modified click). */
function sessionLinkOf(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || (link.target && link.target !== "_self") || link.origin !== window.location.origin) return false;
  return isSessionSheetPath(link.pathname);
}

/**
 * The sheet answers the tap at once: from the tap on a session (a row, a card, a slide) until its address has
 * answered, the sheet is already up with its own skeleton over the screen, which is not touched (no skeleton of
 * the screen: that was the old Detail sesi). The address's own loading UI (@sheet/(.)agenda/[id]/loading.tsx) and the
 * real sheet take over without sliding in again (SessionSheetLoading's flag). A delegated listener, so every link to a
 * session (Agenda, Beranda, Notifikasi) gets it without each screen knowing. Drawn by the (app) layout.
 */
export function SessionSheetPending() {
  const pathname = usePathname();
  const [opening, setOpening] = useState(false);
  const here = isSessionSheetPath(pathname ?? "");
  // The address has changed to the session's: the route's own sheet is there now (derived, no effect).
  if (opening && here) setOpening(false);
  useEffect(() => {
    const onClick = (event: MouseEvent) => { if (sessionLinkOf(event)) setOpening(true); };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  // A navigation that never lands (offline, an error page): do not leave a skeleton hanging.
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setOpening(false), 10_000);
    return () => clearTimeout(timer);
  }, [opening]);
  return opening ? <SessionSheetLoading onClose={() => setOpening(false)} /> : null;
}
