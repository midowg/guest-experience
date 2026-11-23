"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasTrail } from "@/components/main-wam/shell/trail";
import { Sheet, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import { useT } from "@/components/main-wam/i18n";
import { mainWamPath } from "@/lib/routes";
import { SessionBody, SessionKicker, type SessionBodyProps } from "./SessionScreen";

/**
 * Detail sesi as a bottom sheet over Agenda (P04, after the prototype): its height follows its content,
 * grows up to almost the screen and then only the content scrolls; the kind of entry and ✕ stay in view, the
 * title is the first thing in the content, large (prototipe .dsh; the kit's Sheet, its own title only a name). It has an address of its own (/wam/acara/agenda/<id>, so a notification or a link opens
 * it, and Back closes it): the page behind is Agenda of the session's day. Closing goes back when the
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
export function SessionSheetLoading() {
  const router = useRouter();
  const t = useT();
  useEffect(() => {
    const flags = window as unknown as Record<string, unknown>;
    flags[UP_FLAG] = true;
    return () => { setTimeout(() => { flags[UP_FLAG] = false; }, 1500); };
  }, []);
  const close = () => { if (hasTrail()) router.back(); else router.replace(mainWamPath.agenda()); };
  return <Sheet open onClose={close} history={false} title={t("peserta.session.loading")} hideTitle>
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
