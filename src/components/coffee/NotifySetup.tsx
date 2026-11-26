"use client";

import { useId } from "react";
import { Bell, BellOff, BellRing, CircleAlert } from "lucide-react";
import { pushCanTurnOn, pushLabel, pushNote, type CoffeePushPlace } from "@/lib/coffee/notify";
import { useFocusAfter, type PushControl } from "./usePush";
import css from "./coffee.module.css";

/**
 * "Notifikasi" on this device, in the employee app's Akun sheet (F4): what state it is in, in
 * plain words, and the one thing that can be done about it: Nyalakan, or Matikan and a test once
 * it is on. A state nothing can be done about in the app (blocked in the browser, an iPhone that
 * has not installed the app, a browser without web push, a server without the keys) says what is
 * in the way and how to get past it; the app works the same meanwhile.
 */
export function PushBox({ push, place = "karyawan" }: { push: PushControl; place?: CoffeePushPlace }) {
  const id = useId();
  const { state, busy } = push;
  // Nyalakan and Matikan replace each other: the focus goes to the line that says what happened (audit F5-09).
  const { target, follow } = useFocusAfter<HTMLParagraphElement>(!busy, state);
  if (state === "checking") return null;
  const Icon = state === "on" ? BellRing : pushCanTurnOn(state) ? Bell : BellOff;
  const press = (action: () => unknown, moves = true) => () => { if (busy) return; if (moves) follow(); void action(); };
  return (
    <section className={css.pushBox} aria-labelledby={id}>
      <span className={css.pushHead}>
        <Icon aria-hidden size={20} />
        <strong id={id}>Notifikasi</strong>
        <span className={css.pushTag} data-on={state === "on" || undefined}>{pushLabel(state)}</span>
      </span>
      <p role="status" tabIndex={-1} ref={target}>{push.message || pushNote(state, place, push.waiting)}</p>
      {push.error && <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{push.error}</span></p>}
      {(pushCanTurnOn(state) || state === "on") && (
        <div className={css.pushActions}>
          {pushCanTurnOn(state) && <button type="button" aria-disabled={busy || undefined} onClick={press(push.enable)}>{busy ? "Menunggu izin…" : "Nyalakan notifikasi"}</button>}
          {state === "on" && push.test && <button type="button" aria-disabled={busy || undefined} onClick={press(push.test, false)}>Kirim notifikasi tes</button>}
          {state === "on" && <button type="button" aria-disabled={busy || undefined} onClick={press(push.disable)}>Matikan</button>}
        </div>
      )}
    </section>
  );
}
