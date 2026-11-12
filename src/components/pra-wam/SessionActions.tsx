"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeftRight, QrCode, Upload } from "lucide-react";
import rows from "./peserta.module.css";

/*
 * Detail sesi's buttons at the bottom (Penpot P3: "Scan QR untuk absen", then "Unggah materi" and
 * "Ganti jadwal") open forms that live in DocumentList and RequestChange. They ask by an intent:
 * a window event on the same page, or the address's hash (#unggah-materi, #ganti-jadwal) when
 * another screen links here. In the sheet over Agenda and Beranda the bar sits in the sheet's foot
 * and the forms in its body, so the same event reaches them.
 */

export type SessionIntent = "unggah-materi" | "ganti-jadwal";
const EVENT = "pw:session-intent";

export function askSessionIntent(intent: SessionIntent) {
  window.dispatchEvent(new CustomEvent<SessionIntent>(EVENT, { detail: intent }));
}

/** Runs `onAsk` when the intent is asked on this page, or was in the address on arrival. */
export function useSessionIntent(intent: SessionIntent, onAsk: () => void, enabled = true) {
  const latest = useRef(onAsk);
  useEffect(() => { latest.current = onAsk; });
  useEffect(() => {
    if (!enabled) return;
    if (window.location.hash === `#${intent}`) {
      // Once handled, the hash goes, so a refresh or the back button does not open it again.
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
      latest.current();
    }
    const listener = (event: Event) => { if ((event as CustomEvent<SessionIntent>).detail === intent) latest.current(); };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [intent, enabled]);
}

type Props = {
  /** The in-app scanner, when the person can check in now or soon. */
  scanHref: string | null;
  /** "Saya hadir" is the main way to check in (in the content): the QR button steps back. */
  scanSecondary?: boolean;
  upload: boolean;
  reschedule: boolean;
  /** Panitia's links (QR and attendance, change the session). */
  children?: ReactNode;
  /** In a sheet's foot: no frame or stickiness of its own, the foot has them. */
  bare?: boolean;
};

/**
 * Unggah materi right under "Lihat semua peserta" (12 Nov 2026), no longer in the bar at the
 * bottom: it opens the upload form of the Materi part below, and scrolls to it.
 */
export function UploadMaterialButton() {
  return <button type="button" className="button button--secondary" onClick={() => {
    askSessionIntent("unggah-materi");
    window.setTimeout(() => document.getElementById("materi")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 60);
  }}><Upload size={18} aria-hidden /> Unggah materi</button>;
}

export function SessionActions({ scanHref, scanSecondary, upload, reschedule, children, bare }: Props) {
  if (!scanHref && !upload && !reschedule && !children) return null;
  return <div className={`${rows.actionBar} ${bare ? rows.actionBarBare : ""}`}>
    {scanHref && <a className={`button ${scanSecondary ? "button--secondary" : "button--primary"}`} href={scanHref}><QrCode size={20} aria-hidden /> Scan QR untuk absen</a>}
    {(upload || reschedule || children) && <div className={rows.actionPair}>
      {upload && <button type="button" className="button button--secondary" onClick={() => askSessionIntent("unggah-materi")}><Upload size={18} aria-hidden /> Unggah materi</button>}
      {reschedule && <button type="button" className="button button--secondary" onClick={() => askSessionIntent("ganti-jadwal")}><ArrowLeftRight size={18} aria-hidden /> Ganti jadwal</button>}
      {children}
    </div>}
  </div>;
}
