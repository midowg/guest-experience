"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, X } from "lucide-react";
import { pushCanTurnOn, pushNote } from "@/lib/coffee/notify";
import type { PushControl } from "@/components/coffee/usePush";
import css from "./coffee-admin.module.css";

/**
 * "Nyalakan notifikasi" for the pengelola, above the queue (F4): new claims and meeting orders
 * reach this device also while the admin is closed. One line: what state this device is in and the
 * one thing to do about it. What cannot be fixed here says why (blocked in the browser, a browser
 * without web push, the super admin's sign-in that belongs to nobody, a server without the VAPID
 * keys or the migration) and can be closed; the queue keeps refreshing by itself either way.
 */
export function PushBar({ push }: { push: PushControl }) {
  const [closed, setClosed] = useState(false);
  const { state, busy } = push;
  if (state === "checking") return null;
  const fixable = pushCanTurnOn(state) || state === "on";
  if (closed && !fixable && !push.error) return null;
  const Icon = state === "on" ? BellRing : pushCanTurnOn(state) ? Bell : BellOff;
  return (
    <div className={css.pushBar} data-on={state === "on" || undefined}>
      <Icon size={20} aria-hidden />
      <span role="status">{state === "on" ? "Notifikasi pesanan baru aktif di perangkat ini." : pushNote(state, "pengelola", push.waiting)}</span>
      {pushCanTurnOn(state) && <button type="button" className={css.secondary} disabled={busy} onClick={() => void push.enable()}>{busy ? "Menunggu izin…" : "Nyalakan notifikasi"}</button>}
      {state === "on" && <button type="button" className={css.textButton} disabled={busy} onClick={() => void push.disable()}>Matikan</button>}
      {!fixable && <button type="button" className={css.iconButton} aria-label="Tutup keterangan notifikasi" onClick={() => setClosed(true)}><X size={18} aria-hidden /></button>}
      {push.error && <p className={css.error} role="alert">{push.error}</p>}
    </div>
  );
}
