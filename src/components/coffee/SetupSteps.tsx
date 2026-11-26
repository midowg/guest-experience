"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronLeft, Coffee, Download, EllipsisVertical, Share, SquarePlus } from "lucide-react";
import { pushNote, type CoffeePushState } from "@/lib/coffee/notify";
import type { PhoneKind } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import css from "./coffee.module.css";

/**
 * Web push in the step "Izinkan notifikasi" (F4). `allow` asks the phone for permission and
 * subscribes this device. `state` is what the device can do (usePush): when it cannot be turned on
 * here (blocked, an iPhone that has not installed the app yet, a browser without web push, a
 * server without the keys) the step says what is in the way instead of offering a button that
 * does nothing. Without `notify` at all (a preview or a test without push) it reads as not ready.
 */
export type NotifySetup = { allow: () => Promise<"granted" | "denied" | "unsupported">; state?: CoffeePushState };

/**
 * "Atur sekali", shown once after the first sign-in: pasang di layar utama (skipped when the app
 * already runs from the home screen), then notifikasi. Both can be skipped ("Nanti saja").
 * `onInstall`: shows the browser's own install prompt when it offered one; false when there is none.
 */
export function SetupSteps({ phone, installed, onInstall, notify, onDone }: {
  phone: PhoneKind; installed: boolean; onInstall?: () => Promise<boolean>; notify?: NotifySetup; onDone: () => void;
}) {
  // `installed` is only known in the browser (after the first paint), so the step follows it until the person moves.
  const [picked, setStep] = useState<"install" | "notify" | null>(null);
  const step = installed ? "notify" : picked ?? "install";
  const total = installed ? 1 : 2;
  const index = step === "install" ? 1 : total;
  // The step changed without a page load and the button that was pressed is gone: the focus goes to the new step's heading.
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    if (picked) root.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [step, picked]);
  return (
    <div className={css.activation} ref={root}>
      <header className={css.stepbar}>
        {step === "notify" && !installed
          ? <button type="button" className={css.iconButton} aria-label="Kembali" onClick={() => setStep("install")}><ChevronLeft aria-hidden size={24} /></button>
          : null}
        <span>Atur sekali · {index} dari {total}</span>
        <span className={css.progress} aria-hidden><span style={{ width: `${(index / total) * 100}%` }} /></span>
      </header>
      {step === "install"
        ? <InstallStep first={phone} onInstall={onInstall} onNext={() => setStep("notify")} />
        : <NotifyStep notify={notify} onDone={onDone} />}
    </div>
  );
}

function InstallStep({ first, onInstall, onNext }: { first: PhoneKind; onInstall?: () => Promise<boolean>; onNext: () => void }) {
  const [phone, setPhone] = useState<PhoneKind>(first);
  const [busy, setBusy] = useState(false);
  const [missed, setMissed] = useState(false);
  const ios = phone === "iphone";
  const install = async () => {
    if (busy) return;
    setBusy(true);
    const shown = onInstall ? await onInstall().catch(() => false) : false;
    setBusy(false);
    // The browser showed its own question: on. It offered none: the steps above say how, and the button moves on.
    if (shown || missed) onNext(); else setMissed(true);
  };
  return (
    <section className={css.stepBody}>
      <h1 tabIndex={-1}>Pasang di layar utama</h1>
      <p className={css.lead}>Seterusnya cukup ketuk ikon ini, tanpa membuka tautan lagi.</p>
      <div className={css.appIcon}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon */}
        <img src={coffeePath.icon("icon-192.png")} alt="" width={64} height={64} />
        Werkudara Coffee
      </div>
      <div className={css.segmented} role="group" aria-label="Jenis HP">
        <button type="button" aria-pressed={!ios} onClick={() => setPhone("android")}>Android</button>
        <button type="button" aria-pressed={ios} onClick={() => setPhone("iphone")}>iPhone</button>
      </div>
      <ol className={css.howto}>
        {ios ? (
          <>
            <li><Share aria-hidden size={20} /><span>Ketuk <strong>Bagikan</strong> di bawah layar Safari</span></li>
            <li><SquarePlus aria-hidden size={20} /><span>Pilih <strong>Tambah ke Layar Utama</strong></span></li>
            <li><Check aria-hidden size={20} /><span>Ketuk <strong>Tambah</strong></span></li>
          </>
        ) : (
          <>
            <li><Download aria-hidden size={20} /><span>Ketuk <strong>Pasang sekarang</strong> di bawah</span></li>
            <li><EllipsisVertical aria-hidden size={20} /><span>Tidak muncul? Buka menu <strong>⋮</strong> Chrome</span></li>
            <li><SquarePlus aria-hidden size={20} /><span>Pilih <strong>Tambahkan ke layar utama</strong></span></li>
          </>
        )}
      </ol>
      <div className={css.footer}>
        {missed && !ios && <p className={css.hint} role="status">Browser ini belum menawarkan pemasangan. Pasang lewat menu ⋮ seperti langkah di atas, lalu lanjut.</p>}
        {ios
          ? <button type="button" className={css.primary} onClick={onNext}>Sudah, lanjut</button>
          : <button type="button" className={css.primary} aria-disabled={busy || undefined} onClick={install}><Download aria-hidden size={20} />{missed ? "Sudah, lanjut" : "Pasang sekarang"}</button>}
        <button type="button" className={css.textButton} onClick={onNext}>Nanti saja</button>
      </div>
    </section>
  );
}

function NotifyStep({ notify, onDone }: { notify?: NotifySetup; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState("");
  const state: CoffeePushState = notify ? notify.state ?? "off" : "not-ready";
  const allow = async () => {
    if (busy || !notify) return;
    setBusy(true);
    const answer = await notify.allow().catch(() => "unsupported" as const);
    setBusy(false);
    if (answer === "granted") onDone();
    // Refused by the person or impossible here: the state (now "denied", "not-ready", …) brings its own words; anything else gets these.
    else setRefused(answer === "denied"
      ? "Notifikasi belum diizinkan. Aplikasi tetap jalan: status pengajuan berubah sendiri di Pesanan saya. Kamu bisa menyalakannya nanti dari menu Akun."
      : "Notifikasi belum bisa dinyalakan di HP ini. Aplikasi tetap jalan: status pengajuan berubah sendiri di Pesanan saya.");
  };
  // What is in the way, in the state's own words; the words above only where the state has nothing to say.
  const note = state === "on" ? "Notifikasi sudah aktif di perangkat ini." : state !== "off" && state !== "checking" ? pushNote(state, "karyawan") : refused;
  return (
    <section className={css.stepBody}>
      <h1 tabIndex={-1}>Izinkan notifikasi</h1>
      <p className={css.lead}>Supaya kamu tahu begitu pengajuan selesai diproses dan kopi siap diambil, juga saat aplikasi tertutup.</p>
      <div className={css.notifPreview} aria-hidden>
        <span className={css.toastIcon}><Coffee size={18} /></span>
        <span><strong>Silakan ambil di mesin</strong><span>Café Latte kamu selesai diproses oleh Dewi.</span></span>
      </div>
      <div className={css.footer}>
        {note && <p className={css.hint} role="status">{note}</p>}
        {notify && !note
          ? <>
            <button type="button" className={css.primary} aria-disabled={busy || undefined} onClick={allow}><Bell aria-hidden size={20} />{busy ? "Menunggu izin…" : "Izinkan notifikasi"}</button>
            <button type="button" className={css.textButton} onClick={onDone}>Nanti saja</button>
          </>
          : <button type="button" className={css.primary} onClick={onDone}>Mulai pesan</button>}
      </div>
    </section>
  );
}
