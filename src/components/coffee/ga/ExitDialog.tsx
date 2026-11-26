"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { Layer } from "../Layer";
import { useSettled } from "./parts";
import css from "./ga.module.css";

/** What the app answers when a PIN was typed: right, wrong (with the words to show), or no PIN is set at all. */
export type PinAnswer = { ok: true } | { ok: false; message: string; unset?: boolean };
/** How the book is left: with the PIN GA when one is set (`check` asks the server), else with a question. */
export type BookExit = { pin: boolean; check: (pin: string) => Promise<PinAnswer> };

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Leaving the guest menu book. With a PIN GA set (Pengaturan in /admin/coffee): four digits on a
 * keypad of large keys, checked by the server, never by the page; a wrong PIN says so and starts
 * over. No text field, so no keyboard slides over the book. Without a PIN yet: a question for the
 * GA officer, as before. The safe answer has the focus, and nothing listens to the second tap of
 * the press that opened the dialog.
 */
export function ExitDialog({ count, exit, onStay, onLeave }: { count: number; exit: BookExit; onStay: () => void; onLeave: () => void }) {
  const titleId = useId(), helpId = useId();
  const settled = useSettled();
  const [withPin, setWithPin] = useState(exit.pin);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const asked = useRef(false);
  /** What is typed, also between two renders (two quick keys). */
  const digits = useRef("");
  const write = (next: string) => { digits.current = next; setTyped(next); };
  const picks = count ? `${count} pilihan tamu dimasukkan ke pesanan. Periksa lalu kirim dari layar GA.` : "Belum ada pilihan tamu.";

  const submit = useCallback(async (pin: string) => {
    if (asked.current) return;
    asked.current = true;
    setBusy(true); setProblem("");
    const answer = await exit.check(pin).catch((): PinAnswer => ({ ok: false, message: "PIN belum bisa diperiksa. Periksa jaringan lalu coba lagi." }));
    asked.current = false;
    if (answer.ok) { onLeave(); return; }
    setBusy(false); write("");
    // The pengelola took the PIN away meanwhile (or never set one): the question is all there is.
    if (answer.unset) { setWithPin(false); return; }
    setProblem(answer.message);
  }, [exit, onLeave]);

  const press = useCallback((digit: string) => {
    if (busy || !settled()) return;
    if (digits.current.length >= PIN_LENGTH) return;
    setProblem("");
    const next = digits.current + digit;
    write(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }, [busy, settled, submit]);
  const erase = useCallback(() => { if (!busy) { setProblem(""); write(digits.current.slice(0, -1)); } }, [busy]);

  // A keyboard that happens to be attached types the PIN too.
  useEffect(() => {
    if (!withPin) return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key); }
      else if (event.key === "Backspace") { event.preventDefault(); erase(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [withPin, press, erase]);

  if (!withPin) return (
    <Layer kind="dialog" alert labelledBy={titleId} onClose={onStay} rootClass={css.ga} panelClass={css.askDialog}>
      <h2 id={titleId}>Kembali ke mode GA?</h2>
      <p>{picks} Khusus petugas GA.</p>
      <div className={css.askFoot}>
        <button type="button" className={css.secondary} data-autofocus onClick={onStay}>Tetap di buku menu</button>
        <button type="button" className={css.primary} onClick={() => { if (settled()) onLeave(); }}>Ya, mode GA</button>
      </div>
    </Layer>
  );

  return (
    <Layer kind="dialog" alert labelledBy={titleId} onClose={onStay} rootClass={css.ga} panelClass={`${css.askDialog} ${css.pinDialog}`}>
      <h2 id={titleId} tabIndex={-1} data-autofocus>Masukkan PIN GA</h2>
      <p id={helpId}>Khusus petugas GA. {picks}</p>
      <div className={css.pinDots} role="img" aria-label={`${typed.length} dari ${PIN_LENGTH} angka diisi`}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => <span key={index} data-on={index < typed.length || undefined} />)}
      </div>
      <p className={css.pinSaid} role="alert">{busy ? "Memeriksa…" : problem}</p>
      <div className={css.pinPad} role="group" aria-label="Angka PIN" aria-describedby={helpId}>
        {KEYS.map(digit => <button key={digit} type="button" className={css.pinKey} aria-disabled={busy || undefined} onClick={() => press(digit)}>{digit}</button>)}
        <button type="button" className={`${css.pinKey} ${css.pinWord}`} onClick={onStay}>Batal</button>
        <button type="button" className={css.pinKey} aria-disabled={busy || undefined} onClick={() => press("0")}>0</button>
        <button type="button" className={`${css.pinKey} ${css.pinWord}`} aria-label="Hapus angka terakhir" aria-disabled={busy || !typed || undefined} onClick={erase}><Delete aria-hidden size={24} /></button>
      </div>
    </Layer>
  );
}
