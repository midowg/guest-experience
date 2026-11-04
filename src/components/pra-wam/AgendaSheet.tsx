"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, RotateCw, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { AGENDA_ITEM, askedItem, bookingRights, withItem, type SessionView } from "@/lib/pra-wam/agenda";
import { praWamApi } from "@/lib/routes";
import type { AgendaItem } from "@/lib/server/pra-wam/agenda";
import { errorText, praWamRequest } from "./api";
import { BookingDetailActions, BookingDetailBody, type BookingItem } from "./BookingDetail";
import { SessionDetailBody, WaitingSession, sessionDetailActions } from "./SessionDetail";
import { Sheet } from "./Sheet";
import own from "./agenda-sheet.module.css";

/*
 * An agenda item opens over the page, never on another page (Agenda and Beranda): a sheet from
 * the bottom on a phone, a panel from the right on a desktop (Sheet). Any link with
 * data-agenda-item="<key>" opens it. The address keeps ?item=<key> (a new history entry), so a
 * refresh or coming back shows it open again, and the back button, Esc, X or a tap on the dimmed
 * page closes it. A session's detail is read when it opens (a skeleton meanwhile); a booking's is
 * already on the page.
 */

type Props = {
  items: AgendaItem[];
  /** Changes with every render of the page on the server, so router.refresh() reloads the open session too. */
  version: string;
  /** Panitia and admin may cancel anyone's booking. */
  cancelsAny: boolean;
  /** Booking is open (Ubah is only offered then). */
  bookingOpen: boolean;
};

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const subscribeNever = () => () => {};

/** The session's detail, read from the API when it opens and again when the page refreshes. */
function useSessionView(id: string | null, version: string) {
  const [state, setState] = useState<{ id: string; view?: SessionView; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let live = true;
    praWamRequest<SessionView>(praWamApi.sessionDetail(id)).then(
      ({ data }) => { if (live) setState({ id, view: data }); },
      (error: unknown) => { if (live) setState(current => ({ id, view: current?.id === id ? current.view : undefined, error: errorText(error) })); },
    );
    return () => { live = false; };
  }, [id, version, attempt]);
  const current = state && state.id === id ? state : null;
  const retry = () => { setState(value => value && { ...value, error: undefined }); setAttempt(count => count + 1); };
  return { view: current?.view, error: current?.error, retry };
}

export function AgendaSheet({ items, version, cancelsAny, bookingOpen }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  // The sheet's content depends on the clock and the browser: only after hydration.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const key = askedItem(search);
  const item = items.find(entry => entry.key === key) ?? null;
  const { view, error, retry } = useSessionView(item?.kind === "sesi" ? item.sessionId : null, version);
  const [flash, setFlash] = useState<string | null>(null);
  /** Opened here with a new history entry: closing goes back over it. */
  const pushed = useRef(false);
  /** After a cancel or delete: refresh once the item is out of the address. */
  const refreshAfterClose = useRef(false);
  const keys = items.map(entry => entry.key).join(" ");

  const close = useCallback(() => {
    if (pushed.current) { pushed.current = false; window.history.back(); return; }
    window.history.replaceState(null, "", withItem(here(), null));
  }, []);

  useEffect(() => {
    const known = new Set(keys.split(" "));
    // Capture phase: before WamNavigator turns the link into a page change.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const next = (event.target as Element | null)?.closest?.(`a[${AGENDA_ITEM}]`)?.getAttribute(AGENDA_ITEM);
      if (!next || !known.has(next)) return;
      event.preventDefault();
      setFlash(null);
      window.history.pushState({ agendaItem: next }, "", withItem(here(), next));
      pushed.current = true;
    };
    const onPop = () => { pushed.current = false; };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPop); };
  }, [keys]);

  useEffect(() => {
    if (key || !refreshAfterClose.current) return;
    refreshAfterClose.current = false;
    router.refresh();
  }, [key, router]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const done = (message: string) => { setFlash(message); refreshAfterClose.current = true; close(); };
  const now = new Date();
  const booking: BookingItem | null = item?.kind === "appraisal" && item.booking ? { ...item, booking: item.booking } : null;
  const viewer = { cancelsAny, bookingOpen };
  const rights = booking ? bookingRights({ mine: booking.booking.mine, endsAt: booking.endsAt }, viewer, now) : null;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  if (booking) {
    body = <BookingDetailBody item={booking} />;
    if (rights && (rights.edit || rights.cancel)) footer = <BookingDetailActions item={booking} viewer={viewer} onDone={done} />;
  } else if (item && view?.kind === "sesi") {
    body = <SessionDetailBody view={view} now={now} />;
    footer = sessionDetailActions({ view, now }, true);
  } else if (item && view?.kind === "menunggu") {
    body = <WaitingSession session={view.session} bare />;
  } else if (item && error) {
    body = <div className={own.problem}>
      <Notice tone="error" role="alert">{error}</Notice>
      <button type="button" className="button button--secondary" onClick={retry}><RotateCw size={18} aria-hidden /> Coba lagi</button>
    </div>;
  } else if (item) {
    body = <SessionSkeleton />;
  }

  return <>
    <Sheet open={mounted && !!item} onClose={close} title={item?.title ?? "Rincian"} footer={footer}>
      {body}
    </Sheet>
    {flash && <div className={own.toast} role="status">
      <CheckCircle2 aria-hidden /><span>{flash}</span>
      <button type="button" className={own.toastClose} onClick={() => setFlash(null)} aria-label="Tutup pesan"><X aria-hidden /></button>
    </div>}
  </>;
}

/** The shape of Detail sesi while it loads: tags, the check-in line, Rincian, Materi. */
function SessionSkeleton() {
  return <div className={own.skeleton} aria-busy="true" aria-label="Memuat rincian sesi">
    <div className={own.boneRow}><span className={`${own.bone} ${own.bonePill}`} /><span className={`${own.bone} ${own.bonePill}`} /></div>
    <span className={`${own.bone} ${own.boneLine}`} />
    <span className={`${own.bone} ${own.boneCard}`} />
    <span className={`${own.bone} ${own.boneShort}`} />
    <span className={`${own.bone} ${own.boneDoc}`} />
    <span className={`${own.bone} ${own.boneDoc}`} />
  </div>;
}
