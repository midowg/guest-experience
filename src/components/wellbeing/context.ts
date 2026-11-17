"use client";

import { createContext, createElement, useCallback, useContext, useSyncExternalStore } from "react";
import type { WbMe, WbMyActivity, WbMyActivityFilter, WellbeingSection } from "@/lib/wellbeing/app-types";
import { realApi, type BoardDim, type BoardPeriod, type WellbeingApi } from "./api";

/*
 * Wellbeing app (17 Nov 2026): what every screen can reach. Data keys all start with "wbapp:" (not
 * Admin Wellbeing's "wb:"), so one revalidate("wbapp:") refreshes every screen after a change.
 */

export const keys = {
  all: "wbapp:",
  home: "wbapp:home",
  catalog: "wbapp:catalog",
  activities: (filter: WbMyActivityFilter) => `wbapp:activities:${filter}`,
  activity: (id: string) => `wbapp:activity:${id}`,
  board: (period: BoardPeriod, dim: BoardDim) => `wbapp:board:${period}:${dim}`,
  ledger: "wbapp:ledger",
  strava: "wbapp:strava",
  /** Hadiah (18 Nov 2026): saldo, rewards, my claims. */
  rewards: "wbapp:rewards",
};

/** Opens Catat at a kind of activity (Catat ulang, or Catat olahraga from the Strava card). */
export type CatatPreset = { code?: string; kind?: "daily" | "sport"; date?: string };

export type WellbeingActions = {
  api: WellbeingApi;
  me: WbMe;
  go: (section: WellbeingSection) => void;
  openCatat: (preset?: CatatPreset) => void;
  openActivity: (activity: WbMyActivity) => void;
  openStrava: () => void;
  openTheme: () => void;
  /** Foto profil: a photo, or my WAM character card made into one (18 Nov 2026). */
  openPhoto: () => void;
  /** After Foto profil saved or removed: the new address (null for initials), shown at once. */
  setPhoto: (photo: string | null) => void;
  /** Peringkat's full list (Lihat semua), for the period and dimension on screen. */
  openBoard: () => void;
  /** Hadiah (18 Nov 2026): the rewards, or my claims. */
  openRewards: (tab?: "hadiah" | "klaim") => void;
  askSignOut: () => void;
};
const noop = () => {};
export const WellbeingContext = createContext<WellbeingActions>({
  api: realApi, me: { id: "", name: "", nickname: "", department: "", position: "" },
  go: noop, openCatat: noop, openActivity: noop, openStrava: noop, openTheme: noop, openPhoto: noop, setPhoto: noop, openBoard: noop, openRewards: noop, askSignOut: noop,
});
export const useWellbeing = () => useContext(WellbeingContext);

/* ---------- Tema (Sistem/Terang/Gelap), remembered on this device ---------- */

export type ThemeChoice = "system" | "light" | "dark";
const THEME_KEY = "wellbeing-theme";
const themeListeners = new Set<() => void>();
// Kept here as well, for a browser that refuses storage (private mode): the choice lasts the visit.
let themeInMemory: ThemeChoice = "system";
function readTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return themeInMemory; }
}
const subscribeTheme = (listener: () => void) => {
  themeListeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { themeListeners.delete(listener); window.removeEventListener("storage", onStorage); };
};
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as const);
  const set = useCallback((choice: ThemeChoice) => {
    themeInMemory = choice;
    try { if (choice === "system") window.localStorage.removeItem(THEME_KEY); else window.localStorage.setItem(THEME_KEY, choice); } catch { /* storage unavailable: kept in memory */ }
    themeListeners.forEach(listener => listener());
  }, []);
  return [theme, set];
}

/**
 * Runs while the page is still being parsed, so a remembered Terang/Gelap is on the frame before the
 * first paint (the server cannot know it). React then takes over with the same value.
 */
const themeBootScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.currentScript.parentElement.setAttribute("data-theme",t)}catch(e){}`;
const never = () => () => {};
/** The boot script, only in the server's HTML (and while hydrating it); a page drawn in the browser does not need it. */
export function ThemeBoot() {
  const fromServer = useSyncExternalStore(never, () => false, () => true);
  return fromServer ? createElement("script", { dangerouslySetInnerHTML: { __html: themeBootScript } }) : null;
}

/* ---------- Online / offline ---------- */

const subscribeOnline = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
};
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/** Whether the person asked for less motion. */
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
