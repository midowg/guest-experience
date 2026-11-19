"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { History as HistoryIcon, House, Plus, Trophy, UserRound, WifiOff } from "lucide-react";
import { load, prefetch, revalidate, useResource } from "@/components/app-shell/resource";
import { ToastProvider, useToast } from "@/components/app-shell/Toast";
import { WELLBEING_PATH } from "@/lib/routes";
import { WELLBEING_SECTIONS, type WbMe, type WbMyActivity, type WellbeingSection } from "@/lib/wellbeing/app-types";
import { wlmTitle } from "@/lib/wellbeing/brand";
import { realApi, type BoardDim, type BoardPeriod, type WellbeingApi } from "./api";
import { Board, BoardSheet } from "./Board";
import { CatatSheet } from "./CatatSheet";
import { fontVars } from "./font";
import { keys, reducedMotion, ThemeBoot, useOnline, useTheme, WellbeingContext, type CatatPreset, type WellbeingActions } from "./context";
import { History, type HistoryFilter } from "./History";
import { Home } from "./Home";
import { cx } from "./parts";
import { Profile } from "./Profile";
import { Screen } from "./Screen";
import { PhotoSheet } from "./PhotoSheet";
import { ActivitySheet, SignOutSheet, ThemeSheet } from "./Sheets";
import { STRAVA_OPEN, STRAVA_RESULTS, StravaSheet } from "./StravaSheet";
import { RewardsSheet } from "./Rewards";
import { ExportSheet } from "./ExportSheet";
import css from "./wellbeing.module.css";

/*
 * Wellbeing for employees (17 Nov 2026): one client app. The frame (tab bar) stays; Beranda,
 * Riwayat, Peringkat and Profil swap inside it without a page load, each keeping its scroll and
 * filters, from data kept in memory and refreshed in the background (app-shell/resource.ts).
 * Catat and every detail open as sheets; Back closes a sheet, then moves between tabs.
 * The design: docs/desain/wellbeing/index.html (without Quest and Rewards, for now).
 */

const titles: Record<WellbeingSection, string> = { beranda: "Beranda", riwayat: "Riwayat", peringkat: "Peringkat", profil: "Profil" };
export function sectionOf(pathname: string, base = WELLBEING_PATH): WellbeingSection {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0] : "";
  return (WELLBEING_SECTIONS as readonly string[]).includes(rest) ? rest as WellbeingSection : "beranda";
}
const pathOf = (section: WellbeingSection, base: string) => section === "beranda" ? base : `${base}/${section}`;

type Sheet = { kind: "catat"; preset: CatatPreset | null } | { kind: "detail"; activity: WbMyActivity } | { kind: "strava" } | { kind: "theme" } | { kind: "photo" } | { kind: "board" } | { kind: "rewards"; tab: "hadiah" | "klaim" } | { kind: "export" } | { kind: "signout" };

/** Wait until the closed sheet's history entry is gone, so the next sheet's entry is not taken back with it. */
const historySettled = () => new Promise<void>(resolve => {
  const done = () => { window.removeEventListener("popstate", done); clearTimeout(timer); resolve(); };
  window.addEventListener("popstate", done);
  const timer = setTimeout(done, 350);
});

export function WellbeingApp({ me, api = realApi, basePath = WELLBEING_PATH }: { me: WbMe; api?: WellbeingApi; basePath?: string }) {
  const [theme] = useTheme();
  // The phone's status bar follows the theme (and the system's, on Sistem).
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const paint = () => {
      const dark = theme === "dark" || (theme === "system" && !!media?.matches);
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
      meta.content = dark ? "#0A0E15" : "#F3F4F6";
    };
    paint();
    if (theme !== "system" || !media?.addEventListener) return;
    media.addEventListener("change", paint);
    return () => media.removeEventListener("change", paint);
  }, [theme]);
  // The toasts sit inside the themed frame, above the tab bar.
  return <div className={cx(css.tokens, css.app, fontVars)} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
    <ThemeBoot />
    <ToastProvider><App me={me} api={api} basePath={basePath} /></ToastProvider>
  </div>;
}

function App({ me, api, basePath }: { me: WbMe; api: WellbeingApi; basePath: string }) {
  const pathname = usePathname();
  const section = sectionOf(pathname, basePath);
  const [visited, setVisited] = useState<WellbeingSection[]>([section]);
  if (!visited.includes(section)) setVisited([...visited, section]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [board, setBoard] = useState<{ period: BoardPeriod; dim: BoardDim }>({ period: "month", dim: "all" });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // My profile photo: from the page, then whatever Foto profil saved (no page load).
  const [photo, setPhotoNow] = useState<string | null>(me.photo ?? null);
  const setPhoto = useCallback((next: string | null) => { setPhotoNow(next); revalidate("wbapp:board"); }, []);
  const meNow = useMemo(() => ({ ...me, photo }), [me, photo]);
  const [catatRound, setCatatRound] = useState(0);
  // Catat keeps its draft when closed by accident; it starts fresh after a save, or for a preset.
  const catatSaved = useRef(false);
  const sheetNow = useRef<Sheet | null>(null);
  useEffect(() => { sheetNow.current = sheet; }, [sheet]);
  const scrollers = useRef<Partial<Record<WellbeingSection, HTMLDivElement | null>>>({});
  const online = useOnline();
  const toast = useToast();
  const home = useResource(keys.home, () => api.home());

  // What each tab shows: fetched early on a finger on its tab, refreshed when it comes back or is pulled.
  const sources = useMemo(() => {
    const homeSource = [keys.home, () => api.home()] as const;
    const list: Record<WellbeingSection, (readonly [string, () => Promise<unknown>])[]> = {
      beranda: [homeSource],
      riwayat: [historyFilter === "admin" ? [keys.ledger, () => api.ledger()] : [keys.activities(historyFilter), () => api.activities(historyFilter)]],
      peringkat: [[keys.board(board.period, board.dim), () => api.leaderboard(board.period, board.dim)]],
      profil: [homeSource, [keys.ledger, () => api.ledger()]],
    };
    return list;
  }, [api, historyFilter, board]);
  const warm = (target: WellbeingSection) => sources[target].forEach(([key, fetcher]) => prefetch(key, fetcher));
  const refresh = useCallback((target: WellbeingSection) => Promise.all(sources[target].map(([key, fetcher]) => load(key, fetcher))), [sources]);

  // History: Beranda, then at most one tab above it. Tab to tab replaces; Back from any tab returns
  // to Beranda, and Back from Beranda leaves.
  const go = useCallback((target: WellbeingSection) => {
    if (target === section) {
      scrollers.current[target]?.scrollTo?.({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    const href = `${pathOf(target, basePath)}${window.location.search}`;
    if (target === "beranda") {
      if (window.history.state?.wbTab) window.history.back();
      else window.history.replaceState(null, "", href);
    } else if (section === "beranda") window.history.pushState({ wbTab: true }, "", href);
    else window.history.replaceState({ wbTab: true }, "", href);
  }, [section, basePath]);

  // Back from Strava's page (?strava=…, 18 Nov 2026): say how it went, drop it from the address, and once
  // connected refresh what the first sync brings in (it runs on the server after the answer).
  const stravaResult = useEffectEvent(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("strava");
    if (!result) return;
    url.searchParams.delete("strava");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    const said = STRAVA_RESULTS[result] ?? STRAVA_RESULTS.gagal;
    toast({ message: said.message, tone: said.tone });
    revalidate(keys.strava);
    if (result === "tersambung") setTimeout(() => revalidate(keys.all), 6_000);
  });
  useEffect(() => { stravaResult(); }, []);

  // Opened straight on a tab (a link, a reload): put Beranda under it, so Back still goes there first.
  const underlayBeranda = useEffectEvent(() => {
    if (section === "beranda" || window.history.state?.wbTab) return;
    const here = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", `${pathOf("beranda", basePath)}${window.location.search}`);
    window.history.pushState({ wbTab: true }, "", here);
  });
  useEffect(() => { underlayBeranda(); }, []);

  const show = useCallback(async (next: Sheet) => {
    if (sheetNow.current) { setSheet(null); await historySettled(); }
    if (next.kind === "catat" && (next.preset || catatSaved.current)) { catatSaved.current = false; setCatatRound(round => round + 1); }
    setSheet(next);
  }, []);
  const close = useCallback(() => setSheet(null), []);

  const actions = useMemo<WellbeingActions>(() => ({
    api, me: meNow, go,
    openCatat: preset => void show({ kind: "catat", preset: preset ?? null }),
    openActivity: activity => void show({ kind: "detail", activity }),
    openStrava: () => void show({ kind: "strava" }),
    openTheme: () => void show({ kind: "theme" }),
    openPhoto: () => void show({ kind: "photo" }),
    setPhoto,
    openBoard: () => void show({ kind: "board" }),
    openRewards: tab => void show({ kind: "rewards", tab: tab ?? "hadiah" }),
    openExport: () => void show({ kind: "export" }),
    askSignOut: () => void show({ kind: "signout" }),
  }), [api, meNow, go, show, setPhoto]);

  // Coming back to a tab shows what it had at once and refreshes it quietly.
  const refreshShown = useEffectEvent((target: WellbeingSection) => { void refresh(target); });
  const shownOnce = useRef<WellbeingSection | null>(null);
  useEffect(() => {
    if (shownOnce.current && shownOnce.current !== section) refreshShown(section);
    shownOnce.current = section;
    document.title = wlmTitle(section === "beranda" ? undefined : titles[section]);
  }, [section]);

  // Back online: say so, and refresh.
  const wasOnline = useRef(true);
  useEffect(() => {
    if (online && !wasOnline.current) { toast({ message: "Kembali online.", tone: "ok" }); revalidate(keys.all); }
    wasOnline.current = online;
  }, [online, toast]);

  const tabs: { key: WellbeingSection | "catat"; label: string; icon: React.ReactNode }[] = [
    { key: "beranda", label: "Beranda", icon: <House size={24} aria-hidden="true" /> },
    { key: "riwayat", label: "Riwayat", icon: <HistoryIcon size={24} aria-hidden="true" /> },
    { key: "catat", label: "Catat", icon: <Plus size={24} aria-hidden="true" /> },
    { key: "peringkat", label: "Peringkat", icon: <Trophy size={24} aria-hidden="true" /> },
    { key: "profil", label: "Profil", icon: <UserRound size={24} aria-hidden="true" /> },
  ];

  return <WellbeingContext.Provider value={actions}>
      <div className={css.column}>
        {!online && <div className={css.offline} role="status"><WifiOff size={18} aria-hidden="true" />Kamu sedang offline. Yang tampil data terakhir.</div>}
        <main className={css.screens} id="main">
          {visited.includes("beranda") && <Screen title="Beranda" active={section === "beranda"} refreshing={home.refreshing} onRefresh={() => refresh("beranda")} scrollRef={element => { scrollers.current.beranda = element; }}>
            <Home home={home} />
          </Screen>}
          {visited.includes("riwayat") && <Screen title="Riwayat" active={section === "riwayat"} refreshing={false} onRefresh={() => refresh("riwayat")} scrollRef={element => { scrollers.current.riwayat = element; }}>
            <History active={section === "riwayat"} filter={historyFilter} onFilter={setHistoryFilter} />
          </Screen>}
          {visited.includes("peringkat") && <Screen title="Peringkat" active={section === "peringkat"} refreshing={false} onRefresh={() => refresh("peringkat")} scrollRef={element => { scrollers.current.peringkat = element; }}>
            <Board period={board.period} dim={board.dim} onChange={setBoard} />
          </Screen>}
          {visited.includes("profil") && <Screen title="Profil" active={section === "profil"} refreshing={false} onRefresh={() => refresh("profil")} scrollRef={element => { scrollers.current.profil = element; }}>
            <Profile home={home} />
          </Screen>}
        </main>
        <nav className={css.tabbar} aria-label="Menu utama">
          {tabs.map(tab => tab.key === "catat"
            ? <button key={tab.key} type="button" className={cx(css.tab, css.tabCatat)} onClick={() => actions.openCatat()} aria-haspopup="dialog">
                <span className={css.tabInd}>{tab.icon}</span><span>{tab.label}</span></button>
            : <a key={tab.key} href={pathOf(tab.key, basePath)} className={css.tab} aria-current={section === tab.key ? "page" : undefined}
                onPointerDown={() => warm(tab.key as WellbeingSection)}
                onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                  event.preventDefault();
                  go(tab.key as WellbeingSection);
                }}>
                <span className={css.tabInd}>{tab.icon}</span><span>{tab.label}</span></a>)}
        </nav>
      </div>

      <CatatSheet key={catatRound} open={sheet?.kind === "catat"} preset={sheet?.kind === "catat" ? sheet.preset : null} onClose={close} onSaved={() => { catatSaved.current = true; }} />
      <ActivitySheet activity={sheet?.kind === "detail" ? sheet.activity : null} onClose={close} onRedo={preset => void show({ kind: "catat", preset })} />
      {/* Strava closed for now (18 Nov 2026): no sheet, so nothing asks the server about it. */}
      {STRAVA_OPEN && <StravaSheet open={sheet?.kind === "strava"} onClose={close} onLogSport={() => void show({ kind: "catat", preset: { kind: "sport" } })} />}
      <ThemeSheet open={sheet?.kind === "theme"} onClose={close} />
      <PhotoSheet open={sheet?.kind === "photo"} onClose={close} />
      <BoardSheet open={sheet?.kind === "board"} period={board.period} dim={board.dim} onClose={close} />
      <RewardsSheet open={sheet?.kind === "rewards"} tab={sheet?.kind === "rewards" ? sheet.tab : "hadiah"} onClose={close} />
      <ExportSheet open={sheet?.kind === "export"} onClose={close} />
      <SignOutSheet open={sheet?.kind === "signout"} onClose={close} />
  </WellbeingContext.Provider>;
}
