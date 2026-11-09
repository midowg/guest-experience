"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { pushSupport } from "@/lib/pra-wam/push";
import { PRA_WAM_PATH } from "@/lib/routes";
import { Sheet } from "./Sheet";
import own from "./akun.module.css";
import styles from "./pra-wam.module.css";

/*
 * Pengaturan as a menu (9 Nov 2026): every row is short (an icon, a name, what is set now) and
 * opens its details over the page, a sheet from the bottom on a phone and a panel from the right
 * on a desktop (Sheet). The address follows the open row (#notifikasi, #password, ...), so a link
 * such as Pengaturan#password opens it, and Back closes it.
 */

type Props = {
  /** The row's id and its address (`#id`). */
  id: string;
  icon: ReactNode;
  title: string;
  /** What is set now, under the name ("Aktif di HP ini", "Gelap"). */
  summary?: ReactNode;
  /** The sheet's title; the row's name when left out. */
  sheetTitle?: string;
  sheetSubtitle?: ReactNode;
  /** Desktop only: a wider panel (Akses MCP). */
  wide?: boolean;
  /** A brass tile for a row that wants attention. */
  brass?: boolean;
  children: ReactNode;
};

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash.slice(1);

export function SettingsItem({ id, icon, title, summary, sheetTitle, sheetSubtitle, wide, brass, children }: Props) {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const open = hash === id;

  function show() {
    // Marked, so closing knows this page added the entry and Back is safe.
    history.pushState({ wamSheet: id }, "", `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
  function close() {
    // Opened here: Back. Arrived with the hash (a link from Profil): drop it without leaving.
    if (history.state?.wamSheet === id) history.back();
    else { history.replaceState(null, "", location.pathname + location.search); window.dispatchEvent(new HashChangeEvent("hashchange")); }
  }

  return <>
    <button type="button" className={own.rowButton} aria-haspopup="dialog" onClick={show}>
      <span className={`${styles.tile} ${brass ? styles.tileBrass : ""}`} aria-hidden>{icon}</span>
      <span className={own.rowText}>
        <strong>{title}</strong>
        {/* Mounted again on every open and close, so it reads what the sheet may have changed. */}
        {summary && <small key={open ? "open" : "closed"}>{summary}</small>}
      </span>
      <ChevronRight className={own.chevron} aria-hidden />
    </button>
    <Sheet open={open} onClose={close} title={sheetTitle ?? title} subtitle={sheetSubtitle} wide={wide}>{children}</Sheet>
  </>;
}

/** Notifikasi: how this phone stands, read when the row shows and again after its sheet closes. */
export function PushSummary() {
  const [text, setText] = useState("Memeriksa…");
  useEffect(() => {
    let live = true;
    (async () => {
      const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const support = pushSupport({ userAgent: navigator.userAgent, standalone, hasPush });
      let next = support === "ios-install" ? "Buka WAM dari layar utama" : support === "unsupported" ? "Tidak didukung browser ini" : "";
      if (!next) {
        const registration = await navigator.serviceWorker.getRegistration(`${PRA_WAM_PATH}/`).catch(() => undefined);
        const subscription = await registration?.pushManager.getSubscription().catch(() => null);
        next = subscription ? "Aktif di HP ini" : Notification.permission === "denied" ? "Diblokir di HP ini" : "Belum aktif di HP ini";
      }
      if (live) setText(next);
    })();
    return () => { live = false; };
  }, []);
  return <>{text}</>;
}

const THEME_NAMES: Record<string, string> = { light: "Terang", dark: "Gelap", system: "Ikuti perangkat" };
const subscribeTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-wam-theme"] });
  return () => observer.disconnect();
};

/** Tampilan: the theme in use, following the switch inside the sheet at once. */
export function ThemeSummary({ initial }: { initial: string }) {
  const theme = useSyncExternalStore(subscribeTheme, () => document.querySelector("[data-wam-theme]")?.getAttribute("data-wam-theme") ?? initial, () => initial);
  return <>{THEME_NAMES[theme] ?? THEME_NAMES.system}</>;
}
