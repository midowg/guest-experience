"use client";

import { useRouter } from "next/navigation";
import { hasTrail } from "@/components/main-wam/shell/trail";
import { Sheet } from "@/components/main-wam/ui";
import { SessionBody, type SessionBodyProps } from "./SessionScreen";

/**
 * Detail sesi as a bottom sheet over Agenda (P04, after the prototype): its height follows its content,
 * grows up to almost the screen and then only the content scrolls, the title and ✕ stay in view (the
 * kit's Sheet). It has an address of its own (/wam/acara/agenda/<id>, so a notification or a link opens
 * it, and Back closes it): the page behind is Agenda of the session's day. Closing goes back when the
 * person came from inside the app, else to that day's Agenda, so closing never leaves the app.
 */
export function SessionSheet({ closeHref, ...body }: Omit<SessionBodyProps, "withTitle"> & { closeHref: string }) {
  const router = useRouter();
  const close = () => { if (hasTrail()) router.back(); else router.replace(closeHref); };
  // history={false}: the address is the entry (opened by navigating to it), so ✕ and Back both just go back.
  return <Sheet open onClose={close} history={false} title={body.view.title} subtitle={body.view.when}>
    <SessionBody {...body} withTitle={false} />
  </Sheet>;
}
