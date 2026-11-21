"use client";

import { useEffect } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import css from "./hr-admin.module.css";

export type FlashMessage = { tone: "success" | "error"; text: string } | null;

/**
 * What an action did, where the eye is (21 Nov 2026, found in the audit): a message floating at the
 * foot of the screen, not at the top of a long page the person has scrolled away from (on a phone
 * a "Disimpan" or an error up there was never seen, so buttons seemed to do nothing). A success
 * goes after five seconds; a problem stays until it is closed. Screen readers hear both.
 */
export function Flash({ message, onClose }: { message: FlashMessage; onClose(): void }) {
  useEffect(() => {
    if (!message || message.tone === "error") return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return <div className={css.flash} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
    {message.tone === "error" ? <TriangleAlert size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
    <span>{message.text}</span>
    <button type="button" className={css.flashClose} aria-label="Tutup pesan" onClick={onClose}><X size={16} aria-hidden /></button>
  </div>;
}
