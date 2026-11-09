"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, CheckCircle2, Download, Info } from "lucide-react";
import { detectInstall, installBrowserLabels, installDevices, installSteps, notificationSteps, type InstallBrowser, type InstallDevice, type InstallStep } from "@/lib/pra-wam/install";
import { InstallArt } from "./InstallArt";
import own from "./akun.module.css";
import css from "./install-guide.module.css";

/*
 * Pengaturan → Install WAM (9 Nov 2026): how to install WAM on this device, as pictures and short
 * steps, for iPhone (Safari, Chrome), Android (Chrome, Samsung Internet) and a laptop (Chrome,
 * Edge, Safari Mac), then how to turn notifications on. Opens on the device and browser it is
 * looked at in; the person can switch. Where the browser offers it (Chrome, Edge, Samsung
 * Internet), "Install sekarang" installs at once.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// The browser offers installing once, early: keep that offer for when the sheet opens.
let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); offer = event as InstallPrompt; listeners.forEach(fire => fire()); });
  window.addEventListener("appinstalled", () => { offer = null; listeners.forEach(fire => fire()); });
}
const subscribeOffer = (onChange: () => void) => { listeners.add(onChange); return () => { listeners.delete(onChange); }; };

/** Opened from its icon (installed), not in a browser tab. */
function standalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
const subscribeNothing = () => () => {};

/** The row's line under "Install WAM": installed here, or what the guide covers. */
export function InstallSummary() {
  const installed = useSyncExternalStore(subscribeNothing, standalone, () => false);
  return <>{installed ? "Sudah ter-install di perangkat ini" : "Cara install di iPhone, Android, dan laptop"}</>;
}

function Steps({ steps, label }: { steps: InstallStep[]; label: string }) {
  return <ol className={css.steps} aria-label={label}>
    {steps.map((step, index) => <li key={`${step.art}-${index}`} className={css.step}>
      <div className={css.art}><InstallArt kind={step.art} /></div>
      <div className={css.stepText}>
        <span className={css.number} aria-hidden>{index + 1}</span>
        <strong>{step.title}</strong>
        <p>{step.text}</p>
      </div>
    </li>)}
  </ol>;
}

export function InstallGuide() {
  const [device, setDevice] = useState<InstallDevice>("iphone");
  const [browser, setBrowser] = useState<InstallBrowser>("safari");
  const [installed, setInstalled] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canInstall = useSyncExternalStore(subscribeOffer, () => offer !== null, () => false);

  // Open on this device and browser (known only in the browser).
  useEffect(() => {
    const found = detectInstall(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the browser after the first paint */
    setDevice(found.device);
    setBrowser(found.browser);
    setInstalled(standalone());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function chooseDevice(next: InstallDevice) {
    setDevice(next);
    setBrowser(installDevices.find(item => item.id === next)!.browsers[0]);
  }

  async function installNow() {
    if (!offer) return;
    const asked = offer;
    await asked.prompt();
    const { outcome } = await asked.userChoice;
    offer = null; listeners.forEach(fire => fire());
    setNote(outcome === "accepted" ? "WAM sedang di-install. Buka dari ikonnya, lalu nyalakan notifikasi." : "Belum di-install. Kamu bisa mencoba lagi kapan saja.");
  }

  function openNotifications() {
    history.replaceState({ wamSheet: "notifikasi" }, "", "#notifikasi");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const browsers = installDevices.find(item => item.id === device)!.browsers;
  return <div className={css.guide}>
    {installed
      ? <p className={css.done} role="status"><CheckCircle2 aria-hidden />WAM sudah ter-install di perangkat ini. Tinggal nyalakan notifikasinya di bawah.</p>
      : canInstall && <div className={css.now}>
        <p>Browser ini bisa install WAM langsung.</p>
        <button type="button" className="button" onClick={installNow}><Download aria-hidden />Install sekarang</button>
      </div>}
    {note && <p className={own.groupNote} role="status"><Info aria-hidden />{note}</p>}

    <section aria-labelledby="install-judul" className={css.part}>
      <h3 id="install-judul" className={css.title}>Cara install</h3>
      <div className={css.chips} role="group" aria-label="Perangkat">
        {installDevices.map(item => <button key={item.id} type="button" className={css.chip} aria-pressed={device === item.id} onClick={() => chooseDevice(item.id)}>{item.label}</button>)}
      </div>
      {browsers.length > 1 && <div className={`${css.chips} ${css.chipsSmall}`} role="group" aria-label="Browser">
        {browsers.map(item => <button key={item} type="button" className={css.chip} aria-pressed={browser === item} onClick={() => setBrowser(item)}>{installBrowserLabels[item]}</button>)}
      </div>}
      <Steps steps={installSteps[browser]} label={`Cara install di ${installBrowserLabels[browser]}`} />
    </section>

    <section aria-labelledby="notif-judul" className={css.part}>
      <h3 id="notif-judul" className={css.title}>Nyalakan notifikasi</h3>
      <Steps steps={notificationSteps(device)} label="Cara menyalakan notifikasi" />
      <button type="button" className="button button--secondary" onClick={openNotifications}><BellRing aria-hidden />Buka pengaturan Notifikasi</button>
    </section>

    <p className={own.groupNote}><Info aria-hidden />Langkah ini mengikuti panduan resmi Apple, Google, Microsoft, dan Samsung. Nama menu bisa sedikit berbeda menurut versi dan bahasa HP. Masih bingung? Hubungi admin WAM.</p>
  </div>;
}
