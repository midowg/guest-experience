"use client";

import { useEffect } from "react";
import { CircleAlert, Coffee, X } from "lucide-react";
import css from "./coffee.module.css";

export type ToastMessage = {
  id: number;
  tone: "ok" | "no";
  title: string;
  body?: string;
  /** Tapping the message opens something (a decided claim opens Pesanan saya). */
  onOpen?: () => void;
  /** Stays until closed (something went wrong); otherwise it leaves by itself. */
  sticky?: boolean;
};
export const TOAST_MS = 6000;

/**
 * The message on top, as the prototype's notification card: a claim was decided, a claim was sent,
 * something failed. The region is on the page before anything is said, so a screen reader hears it.
 */
export function Toast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!message || message.sticky) return;
    const timer = window.setTimeout(onClose, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  const text = message && <span><strong>{message.title}</strong>{message.body && <span>{message.body}</span>}</span>;
  const icon = message && <span className={css.toastIcon} data-tone={message.tone} aria-hidden>{message.tone === "no" ? <CircleAlert size={18} /> : <Coffee size={18} />}</span>;
  return (
    <div className={css.toastRegion} role="status" aria-live="polite">
      {message && (
        <div key={message.id} className={css.toast}>
          {message.onOpen
            ? <button type="button" className={css.toastBody} onClick={() => { message.onOpen?.(); onClose(); }}>{icon}{text}</button>
            : <>{icon}{text}</>}
          <button type="button" className={css.iconButton} aria-label="Tutup pesan" onClick={onClose}><X aria-hidden size={20} /></button>
        </div>
      )}
    </div>
  );
}
