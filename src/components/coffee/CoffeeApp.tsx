"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ClipboardCheck, Download, LogOut, Tablet, X } from "lucide-react";
import { GROUP_LABEL, drinkLabel, type Drink } from "@/lib/coffee/menu";
import { setupCookie, type PhoneKind } from "@/lib/coffee/setup";
import { coffeeTabLabels, coffeeTabPaths, tabOf, type CoffeeTab } from "@/lib/coffee/tabs";
import type { MyOrder, MyState } from "@/lib/coffee/types";
import { coffeeAdminPath, coffeePath } from "@/lib/routes";
import { coffeeClient, type ClaimBody, type CoffeeApi } from "./api";
import { CoffeeFrame } from "./CoffeeFrame";
import { DrinkSheet } from "./DrinkSheet";
import { Layer, onLayerEntry } from "./Layer";
import { MenuScreen } from "./MenuScreen";
import { OrdersScreen } from "./OrdersScreen";
import { usePwa } from "./pwa";
import { SetupSteps, type NotifySetup } from "./SetupSteps";
import { Toast, type ToastMessage } from "./Toast";
import { useCoffee } from "./useCoffee";
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
  /** Web push (F4): see SetupSteps. */
  notify?: NotifySetup;
  /** The preview's own buttons (not part of the app). */
  tools?: ReactNode;
};

export function CoffeeApp({ initial, api = coffeeClient, tab: first = "menu", routing = "history", setup = false, phone = "android", note, notify, tools }: CoffeeAppProps) {
  const live = routing === "history";
  const [tab, go] = useTab(first, routing);
  const { installed, install } = usePwa(live);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastNo = useRef(0);
  const say = useCallback((message: Omit<ToastMessage, "id">) => setToast({ ...message, id: ++toastNo.current }), []);
  const closeToast = useCallback(() => setToast(null), []);

  /** A claim was decided while the app was open: the message on top, as the notification will read (F4). */
  const onDecided = useCallback((orders: MyOrder[]) => {
    const order = orders[0];
    const drink = drinkLabel(order.slug, order.other), who = order.processedLabel || "pengelola";
    say(order.status === "selesai"
      ? { tone: "ok", title: "Silakan ambil di mesin", body: `${drink} kamu sudah diproses ${who}. Ambil di mesin kopi pantry.`, onOpen: () => go("pesanan") }
      : { tone: "no", title: "Pengajuan tidak bisa diproses", body: `${drink}: lihat catatan dari ${who}. Jatah tidak berkurang.`, onOpen: () => go("pesanan") });
  }, [go, say]);
  const { state, claim, cancel, cancelling } = useCoffee(api, initial, onDecided);
  const { me, orders } = state;
  const waiting = orders.filter(order => order.status === "diproses").length;

  const [sheet, setSheet] = useState<Drink | null>(null);
  const [asking, setAsking] = useState<MyOrder | null>(null);
  const [account, setAccount] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
  const toTab = useCallback((to: CoffeeTab) => {
    if (to === shownTab.current) { window.scrollTo({ top: 0 }); return; }
    scrolls.current[shownTab.current] = window.scrollY;
    go(to);
  }, [go]);

  const submit = useCallback(async (body: ClaimBody): Promise<string> => {
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
    else if (!result.ignored) say({ tone: "no", title: "Tidak bisa dibatalkan", body: result.message, sticky: true });
    landFocus();
  }, [asking, cancel, say]);

  const finishSetup = useCallback(() => {
    if (live) document.cookie = setupCookie();
    setSetupOpen(false);
  }, [live]);

  const signOut = async () => {
    if (leaving) return;
    setLeaving(true);
    await api.signOut().catch(() => undefined);
    setLeaving(false);
    setAccount(false);
  };

  if (setupOpen) return (
    <div className={css.column}>
      <SetupSteps phone={phone} installed={installed} onInstall={install} notify={notify} onDone={finishSetup} />
      {tools}
    </div>
  );

  return (
    <>
      <CoffeeFrame tab={tab} onTab={toTab} waiting={waiting} name={me.name} onAccount={() => setAccount(true)}>
        {tab === "menu"
          ? <MenuScreen me={me} note={noteOpen ? note : undefined} onNote={() => setNoteOpen(false)} onPick={setSheet} />
          : <OrdersScreen orders={orders} cancelling={cancelling} onCancel={setAsking} onMenu={() => toTab("menu")} />}
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
            <button type="button" className={css.iconButton} aria-label="Tutup" onClick={() => setAccount(false)}><X aria-hidden size={22} /></button>
          </div>
          <ul className={css.links}>
            {state.ga && <li><a href={coffeePath.ga}><Tablet aria-hidden size={20} />Mode GA (pesanan rapat)</a></li>}
            {state.pengelola && <li><a href={coffeeAdminPath.home}><ClipboardCheck aria-hidden size={20} />Pengelola (antrean)</a></li>}
            {!installed && <li><button type="button" onClick={() => { setAccount(false); setSetupOpen(true); }}><Download aria-hidden size={20} />Pasang di layar utama</button></li>}
            <li><button type="button" className={css.out} aria-disabled={leaving || undefined} onClick={signOut}><LogOut aria-hidden size={20} />{leaving ? "Keluar…" : "Keluar"}</button></li>
          </ul>
        </Layer>
      )}
      {tools}
    </>
  );
}
