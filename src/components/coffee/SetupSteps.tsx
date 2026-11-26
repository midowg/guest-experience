"use client";

import { useState } from "react";
import { Bell, Check, ChevronLeft, Coffee, Download, EllipsisVertical, Share, SquarePlus } from "lucide-react";
import type { PhoneKind } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import css from "./coffee.module.css";

/**
 * Where web push plugs in (F4). The app passes this once push exists: `allow` asks the phone for
 * permission and subscribes this device; the step then offers "Izinkan notifikasi". Without it
 * (now) the step only explains that the status shows by itself in the app.
 */
export type NotifySetup = { allow: () => Promise<"granted" | "denied" | "unsupported"> };

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
  return (
    <div className={css.activation}>
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
      <h1>Pasang di layar utama</h1>
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
  const allow = async () => {
    if (busy || !notify) return;
    setBusy(true);
    const answer = await notify.allow().catch(() => "unsupported" as const);
    setBusy(false);
    if (answer === "granted") onDone();
    else setRefused(answer === "denied"
      ? "Notifikasi belum diizinkan. Aplikasi tetap jalan: status pengajuan tampil di Pesanan saya."
      : "HP ini belum bisa menerima notifikasi. Aplikasi tetap jalan: status pengajuan tampil di Pesanan saya.");
  };
  return (
    <section className={css.stepBody}>
      <h1>{notify ? "Izinkan notifikasi" : "Notifikasi menyusul"}</h1>
      <p className={css.lead}>{notify
        ? "Supaya kamu tahu begitu pengajuan selesai diproses dan kopi siap diambil."
        : "Sebentar lagi kamu diberi tahu begitu pengajuan selesai diproses. Untuk sekarang, statusnya berubah sendiri di Pesanan saya selama aplikasi terbuka."}</p>
      <div className={css.notifPreview} aria-hidden>
        <span className={css.toastIcon}><Coffee size={18} /></span>
        <span><strong>Werkudara Coffee</strong><span>Café Latte kamu sudah diproses. Ambil di mesin pantry.</span></span>
      </div>
      <div className={css.footer}>
        {refused && <p className={css.hint} role="status">{refused}</p>}
        {notify && !refused
          ? <>
            <button type="button" className={css.primary} aria-disabled={busy || undefined} onClick={allow}><Bell aria-hidden size={20} />{busy ? "Menunggu izin…" : "Izinkan notifikasi"}</button>
            <button type="button" className={css.textButton} onClick={onDone}>Nanti saja</button>
          </>
          : <button type="button" className={css.primary} onClick={onDone}>Mulai pesan</button>}
      </div>
    </section>
  );
}
