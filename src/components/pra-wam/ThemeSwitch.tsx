"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Moon, Smartphone, Sun } from "lucide-react";
import { resolveWamTheme, WAM_THEME_COLORS, wamThemeCookie, type WamTheme } from "@/lib/pra-wam/theme";
import styles from "./pra-wam.module.css";

const OPTIONS: { value: WamTheme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Terang", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Gelap", icon: <Moon aria-hidden /> },
  { value: "system", label: "Ikuti perangkat", icon: <Smartphone aria-hidden /> },
];

/**
 * Stores the choice and repaints at once: the wrapper's data-wam-theme drives the CSS tokens and
 * the body colour (app/wam/layout.tsx), and both theme-color tags follow, so nothing reloads.
 */
function applyWamTheme(theme: WamTheme) {
  document.cookie = wamThemeCookie(theme, location.protocol === "https:");
  document.querySelectorAll("[data-wam-theme]").forEach(node => node.setAttribute("data-wam-theme", theme));
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    const deviceDark = meta.media ? meta.media.includes("dark") : matchMedia("(prefers-color-scheme: dark)").matches;
    meta.content = WAM_THEME_COLORS[resolveWamTheme(theme, deviceDark)].bar;
  });
}

/** Terang, Gelap or Ikuti perangkat, in Profil. */
export function ThemeSwitch({ initial }: { initial: WamTheme }) {
  const name = useId();
  const [theme, setTheme] = useState(initial);
  function choose(next: WamTheme) { setTheme(next); applyWamTheme(next); }
  return <div role="radiogroup" aria-label="Tema tampilan" className={styles.themeSwitch}>
    {OPTIONS.map(option => <label key={option.value} className={styles.themeOption}>
      <input type="radio" className="sr-only" name={name} value={option.value} checked={theme === option.value} onChange={() => choose(option.value)} />
      {option.icon}<span>{option.label}</span>
    </label>)}
  </div>;
}

/**
 * The sign-in screens: one "Mode gelap" switch. "Ikuti perangkat" shows what the device is using
 * (known only in the browser); flipping it chooses light or dark for good.
 */
export function ThemeToggle({ initial }: { initial: WamTheme }) {
  const [dark, setDark] = useState(initial === "dark");
  useEffect(() => {
    if (initial !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(query.matches);
    update();
  }, [initial]);
  function flip() { const next = !dark; setDark(next); applyWamTheme(next ? "dark" : "light"); }
  return <button type="button" role="switch" aria-checked={dark} className={styles.themeToggle} onClick={flip}>
    {dark ? <Moon aria-hidden /> : <Sun aria-hidden />}<span>Mode gelap</span><span className={styles.toggleTrack} aria-hidden><span /></span>
  </button>;
}
