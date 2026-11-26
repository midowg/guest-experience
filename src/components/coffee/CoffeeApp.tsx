"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleAlert, ClipboardCheck, Coffee, Download, LogOut, RefreshCw, Tablet, WifiOff, X } from "lucide-react";
import { GROUP_LABEL, drinkLabel, type Drink } from "@/lib/coffee/menu";
import { wibMonth } from "@/lib/coffee/quota";
import { setupCookie, type PhoneKind } from "@/lib/coffee/setup";
import { coffeeTabLabels, coffeeTabPaths, tabOf, type CoffeeTab } from "@/lib/coffee/tabs";
import type { MyOrder, MyState } from "@/lib/coffee/types";
import { coffeeAdminPath, coffeePath } from "@/lib/routes";
import { coffeeClient, coffeePush, errorText, type ClaimChoice, type CoffeeApi } from "./api";
import { CoffeeFrame } from "./CoffeeFrame";
import { DrinkSheet } from "./DrinkSheet";
import { Layer, leavePage, onLayerEntry } from "./Layer";
import { MenuScreen } from "./MenuScreen";
import { PushBox } from "./NotifySetup";
import { OrdersScreen } from "./OrdersScreen";
import { usePwa } from "./pwa";
import { SetupSteps } from "./SetupSteps";
import { Toast, type ToastMessage } from "./Toast";
import { useCoffee } from "./useCoffee";
import { dropPush, usePush, useWorkerNews, type PushPort } from "./usePush";
import css from "./coffee.module.css";

/*
 * The employee app of Werkudara Coffee: one screen that holds Menu and Pesanan saya, the drink
 * sheet, the questions and the messages. The server draws it once with the person's state; after
 * that everything comes from the API (`api`, a prop, so the preview and the tests run this same
 * component on a make-believe server). Moving between the two tabs changes the address only:
 * nothing is fetched and nothing reloads.
 */

const TAB_EVENT = "coffee:tab";
const subscribeTab = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener(TAB_EVENT, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(TAB_EVENT, listener); };
};

/**
 * Which tab shows. "history": the real app, where each tab has its address and the back button
 * walks through them. "memory": the preview and the tests, where the address stays.
 */
function useTab(first: CoffeeTab, routing: "history" | "memory"): [CoffeeTab, (to: CoffeeTab) => void] {
  const fromAddress = useSyncExternalStore(subscribeTab, () => tabOf(window.location.pathname), () => first);
  const [kept, setKept] = useState(first);
  const go = useCallback((to: CoffeeTab) => {
    if (routing === "memory") { setKept(to); return; }
    if (tabOf(window.location.pathname) === to && !window.location.search) return;
    // A sheet that is closing still holds its own history entry: the tab takes that entry over instead of adding one.
    if (onLayerEntry()) window.history.replaceState({}, "", coffeeTabPaths[to]);
    else window.history.pushState({}, "", coffeeTabPaths[to]);
    window.dispatchEvent(new Event(TAB_EVENT));
  }, [routing]);
  return [routing === "memory" ? kept : fromAddress, go];
}

/** After an action whose button is gone (the sheet closed, the claim changed): the focus goes to the screen, not to nowhere. */
const landFocus = () => window.setTimeout(() => {
  if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>("[data-coffee-focus]")?.focus({ preventScroll: true });
}, 0);

export type CoffeeAppProps = {
  initial: MyState;
  /** The real APIs unless the preview or a test passes a make-believe one. */
  api?: CoffeeApi;
  /** The tab the address asked for (the server knows it). */
  tab?: CoffeeTab;
  routing?: "history" | "memory";
  /** "Atur sekali" has not been walked through on this device yet. */
  setup?: boolean;
  phone?: PhoneKind;
  /** A line for the Menu (someone without Mode GA was sent back here). */
  note?: string;
  /**
   * Web push (F4): the push APIs and the device (usePush). With the real APIs it is the real thing;
   * a preview passes a make-believe one, and null leaves notifications out (the tests).
   */
  push?: PushPort | null;
  /** The preview's own buttons (not part of the app). */
  tools?: ReactNode;
};

export function CoffeeApp({ initial, api = coffeeClient, tab: first = "menu", routing = "history", setup = false, phone = "android", note, push: port = api === coffeeClient ? coffeePush : null, tools }: CoffeeAppProps) {
  const live = routing === "history";
  const [tab, go] = useTab(first, routing);
  const { installed, install } = usePwa(live);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastNo = useRef(0);
  const say = useCallback((message: Omit<ToastMessage, "id">) => setToast({ ...message, id: ++toastNo.current }), []);
  const closeToast = useCallback(() => setToast(null), []);

  /** A claim was decided while the app was open: the message on top, as the notification will read (F4). */
  const onDecided = useCallback((orders: MyOrder[]) => {
    if (orders.length > 1) { say({ tone: "ok", title: `${orders.length} pengajuan sudah diputuskan`, body: "Lihat hasilnya di Pesanan saya.", onOpen: () => go("pesanan") }); return; }
    const order = orders[0];
    const drink = drinkLabel(order.slug, order.other), who = order.processedLabel || "pengelola";
    say(order.status === "selesai"
      ? { tone: "ok", title: "Silakan ambil di mesin", body: `${drink} kamu sudah diproses ${who}. Ambil di mesin kopi pantry.`, onOpen: () => go("pesanan") }
      : { tone: "no", title: "Pengajuan tidak bisa diproses", body: `${drink}: lihat catatan dari ${who}. Jatah tidak berkurang.`, onOpen: () => go("pesanan") });
  }, [go, say]);
  const { state, today, claim, cancel, cancelling, stale, retrying, retry, gone, refresh } = useCoffee(api, initial, onDecided);
  const { me, orders } = state;
  const push = usePush(port);
  // The service worker pushed something, or a notification was tapped: read now (not at the next tick), and show the tab it names.
  useWorkerNews(news => {
    void refresh();
    if (news.type === "open") go(tabOf(news.url.split("?")[0]));
  }, port !== null);
  const waiting = orders.filter(order => order.status === "diproses").length;

  const [sheet, setSheet] = useState<Drink | null>(null);
  const [asking, setAsking] = useState<MyOrder | null>(null);
  const [account, setAccount] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  /** Signed out here: the person's name, quota and claims leave the screen at once, before the sign-in page arrives. */
  const [left, setLeft] = useState(false);
  // The session ended elsewhere (401): the app is already on its way to the sign-in page, and a sheet that closes must not cancel that.
  useEffect(() => { if (gone) leavePage(); }, [gone]);
  const [setupOpen, setSetupOpen] = useState(setup);
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const askId = useId(), accountId = useId();

  // Each tab comes back where it was left; the title follows (no page load sets it).
  const scrolls = useRef<Partial<Record<CoffeeTab, number>>>({});
  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current !== tab) { window.scrollTo(0, scrolls.current[tab] ?? 0); shownTab.current = tab; }
    if (live) document.title = tab === "menu" ? "Werkudara Coffee" : `${coffeeTabLabels[tab]} · Werkudara Coffee`;
  }, [tab, live]);
  // Compared with the tab that is drawn, not with a note an effect writes later: right after a
  // claim moved the screen to Pesanan saya, a tap on Menu arrived before that note and did nothing.
  const toTab = useCallback((to: CoffeeTab) => {
    if (to === tab) { window.scrollTo({ top: 0 }); return; }
    scrolls.current[tab] = window.scrollY;
    go(to);
  }, [go, tab]);

  // A layer covers the message and makes it unreachable (the page behind is inert): an open message closes when one opens.
  const pick = useCallback((drink: Drink) => {
    setToast(null);
    // The app stayed open across the month's end: the quota on screen is last month's.
    if (wibMonth(new Date().toISOString()) !== me.month) void refresh();
    setSheet(drink);
  }, [me.month, refresh]);
  const ask = useCallback((order: MyOrder) => { setToast(null); setAsking(order); }, []);
  const openAccount = useCallback(() => { setToast(null); setLeaveError(""); setAccount(true); }, []);

  const submit = useCallback(async (body: ClaimChoice): Promise<string> => {
    const result = await claim(body);
    if (!result.ok) return result.ignored ? "" : result.message;
    setSheet(null);
    toTab("pesanan");
    say({ tone: "ok", title: result.message || "Pengajuan terkirim." });
    landFocus();
    return "";
  }, [claim, say, toTab]);

  const confirmCancel = useCallback(async () => {
    const order = asking;
    if (!order) return;
    setAsking(null);
    const result = await cancel(order.id);
    if (result.ok) say({ tone: "ok", title: "Pengajuan dibatalkan", body: "Jatah kamu dikembalikan." });
    else if (!result.ignored) {
      // Someone processed it first: one message that says so and what happens now. It stays until
      // closed, and the read that shows the new status does not put its own message over it.
      const now = result.order, drink = drinkLabel(order.slug, order.other), who = now?.processedLabel || "pengelola";
      const body = now?.status === "selesai" ? `${drink} sudah diproses ${who} sebelum sempat dibatalkan, jadi jatahnya terpakai. Silakan ambil di mesin pantry.`
        : now?.status === "ditolak" ? `${drink} sudah ditolak ${who} sebelum sempat dibatalkan. Jatah kamu tidak berkurang; catatannya ada di Pesanan saya.`
        : now?.status === "batal" ? `${drink} sudah dibatalkan sebelumnya. Jatah kamu tidak berkurang.`
        : result.message;
      say({ tone: "no", title: now ? "Tidak bisa dibatalkan" : "Belum bisa dibatalkan", body, sticky: true });
    }
    landFocus();
  }, [asking, cancel, say]);

  const finishSetup = useCallback(() => {
    if (live) document.cookie = setupCookie();
    setSetupOpen(false);
  }, [live]);

  const signOut = async () => {
    if (leaving) return;
    setLeaving(true);
    setLeaveError("");
    // This device stops getting this person's notifications before the session ends (afterwards the server would not listen).
    if (port) await dropPush(port);
    try { await api.signOut(); }
    catch (problem) {
      // The server was not told: the session still lives, so the sheet stays and says so.
      setLeaving(false);
      setLeaveError(errorText(problem));
      return;
    }
    // The sign-in page is on its way. The sheet must not walk the history back now (that cancels
    // the navigation on a phone), and nothing of this person stays on the screen meanwhile.
    leavePage();
    setLeft(true);
  };

  if (left || gone) return (
    <div className={css.column}>
      <main className={css.waiting} tabIndex={-1} data-coffee-focus>
        <span className={css.welcomeMark}><Coffee aria-hidden size={36} /></span>
        <h1>{left ? "Kamu sudah keluar" : "Sesi berakhir"}</h1>
        <p className={css.lead} role="status">Membuka halaman masuk…</p>
        <a className={css.primary} href={coffeePath.login()}>Masuk lagi</a>
      </main>
    </div>
  );

  if (setupOpen) return (
    <div className={css.column}>
      <SetupSteps phone={phone} installed={installed} onInstall={install} notify={port ? { allow: push.enable, state: push.state } : undefined} onDone={finishSetup} />
      {tools}
    </div>
  );

  return (
    <>
      <CoffeeFrame tab={tab} onTab={toTab} waiting={waiting} name={me.name} onAccount={openAccount}>
        {stale && (
          <section className={css.offline} role="status">
            <WifiOff aria-hidden size={18} />
            <span>Tidak tersambung. Status mungkin belum terbaru.</span>
            <button type="button" aria-disabled={retrying || undefined} onClick={() => void retry()}><RefreshCw aria-hidden size={16} />{retrying ? "Memuat…" : "Coba lagi"}</button>
          </section>
        )}
        {tab === "menu"
          ? <MenuScreen me={me} note={noteOpen ? note : undefined} onNote={() => setNoteOpen(false)} onPick={pick} />
          : <OrdersScreen orders={orders} today={today} cancelling={cancelling} onCancel={ask} onMenu={() => toTab("menu")} />}
      </CoffeeFrame>
      <Toast message={toast} onClose={closeToast} />

      {sheet && <DrinkSheet key={sheet.slug} drink={sheet} me={me} onClose={() => setSheet(null)} onSubmit={submit} />}

      {asking && (
        <Layer kind="dialog" alert labelledBy={askId} onClose={() => setAsking(null)}>
          <h2 id={askId}>Batalkan pengajuan?</h2>
          <p>{drinkLabel(asking.slug, asking.other)} belum diproses. Jatah kamu dikembalikan.</p>
          <div className={css.row}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking(null)}>Tidak jadi</button>
            <button type="button" className={css.danger} onClick={confirmCancel}>Batalkan</button>
          </div>
        </Layer>
      )}

      {account && (
        <Layer labelledBy={accountId} onClose={() => { if (!leaving) setAccount(false); }}>
          <span className={css.grabber} aria-hidden />
          <div className={css.accountHead}>
            <span className={css.avatar} aria-hidden>{me.name.trim().slice(0, 1).toUpperCase()}</span>
            <span><strong id={accountId}>{me.name}</strong><span>{GROUP_LABEL[me.group]} · sisa {me.left} dari {me.quota} klaim bulan ini</span></span>
            <button type="button" className={css.iconButton} aria-label="Tutup" onClick={() => { if (!leaving) setAccount(false); }}><X aria-hidden size={22} /></button>
          </div>
          <ul className={css.links}>
            {state.ga && <li><a href={coffeePath.ga}><Tablet aria-hidden size={20} />Mode GA (pesanan rapat)</a></li>}
            {state.pengelola && <li><a href={coffeeAdminPath.home}><ClipboardCheck aria-hidden size={20} />Pengelola (antrean)</a></li>}
            {!installed && <li><button type="button" onClick={() => { setAccount(false); setSetupOpen(true); }}><Download aria-hidden size={20} />Pasang di layar utama</button></li>}
            <li><button type="button" className={css.out} aria-disabled={leaving || undefined} onClick={signOut}><LogOut aria-hidden size={20} />{leaving ? "Keluar…" : "Keluar"}</button></li>
          </ul>
          {port && <PushBox push={push} />}
          {leaveError && <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{leaveError}</span></p>}
        </Layer>
      )}
      {tools}
    </>
  );
}
