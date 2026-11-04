"use client";

import { useId, useState, type ReactNode } from "react";
import { Moon, Smartphone, Sun } from "lucide-react";
import { resolveWamTheme, WAM_THEME_COLORS, wamThemeCookie, type WamTheme } from "@/lib/pra-wam/theme";
import styles from "./pra-wam.module.css";

const OPTIONS: { value: WamTheme; label: string; short: string; icon: ReactNode }[] = [
  { value: "light", label: "Terang", short: "Terang", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Gelap", short: "Gelap", icon: <Moon aria-hidden /> },
  { value: "system", label: "Ikuti perangkat", short: "Perangkat", icon: <Smartphone aria-hidden /> },
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

/** Terang, Gelap or Ikuti perangkat. `compact` is the small one in the corner of the sign-in screens. */
export function ThemeSwitch({ initial, compact }: { initial: WamTheme; compact?: boolean }) {
  const name = useId();
  const [theme, setTheme] = useState(initial);
  function choose(next: WamTheme) { setTheme(next); applyWamTheme(next); }
  return <div role="radiogroup" aria-label="Tema tampilan" className={`${styles.themeSwitch} ${compact ? styles.themeSwitchCompact : ""}`}>
    {OPTIONS.map(option => <label key={option.value} className={styles.themeOption}>
      <input type="radio" className="sr-only" name={name} value={option.value} checked={theme === option.value} onChange={() => choose(option.value)}
        aria-label={compact && option.short !== option.label ? option.label : undefined} />
      {option.icon}<span>{compact ? option.short : option.label}</span>
    </label>)}
  </div>;
}
