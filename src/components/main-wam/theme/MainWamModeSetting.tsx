"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAIN_WAM_MODES, mainWamModeCookie, type MainWamMode } from "@/lib/main-wam/appearance";
import { useT } from "../i18n";
import { Segmented } from "../ui/Segmented";
import { PAGE_COLORS } from "./tokens";

/**
 * Paints a new mode at once, without waiting for the server: the root's attribute drives every
 * token and the page colour behind the app (MainWamTheme), and both theme-color tags follow.
 */
export function applyMainWamMode(mode: MainWamMode) {
  document.cookie = mainWamModeCookie(mode, location.protocol === "https:");
  document.querySelectorAll("[data-main-wam]").forEach(node => node.setAttribute("data-mw-mode", mode));
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    const deviceDark = meta.media ? meta.media.includes("dark") : matchMedia("(prefers-color-scheme: dark)").matches;
    meta.content = mode === "dark" || (mode === "system" && deviceDark) ? PAGE_COLORS.dark : PAGE_COLORS.light;
  });
}

/** Tampilan (Pengaturan): Terang, Gelap or Sistem, kept on this device. Sistem follows the phone's own setting. */
export function MainWamModeSetting({ initial, onChange }: { initial: MainWamMode; /** Told after a new mode is painted (Pengaturan's row shows it). */ onChange?: (mode: MainWamMode) => void }) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState(initial);
  return <Segmented label={t("peserta.appearance.title")} value={mode}
    options={MAIN_WAM_MODES.map(value => ({ value, label: t(`peserta.appearance.${value}`) }))}
    onChange={next => { setMode(next); applyMainWamMode(next); onChange?.(next); router.refresh(); }} />;
}
