"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import admin from "@/components/admin/admin.module.css";
import { errorMessage } from "@/components/admin/shared/api";
import { dropPush, usePush, useWorkerNews, type PushPort } from "@/components/coffee/usePush";
import { consoleThemeClass } from "@/components/console";
import { firstName } from "@/lib/coffee/access";
import { wibDay } from "@/lib/coffee/quota";
import type { QueueOrder, QueueState } from "@/lib/coffee/types";
import type { MenuData } from "@/lib/coffee/types";
import { coffeeAdminClient, coffeeAdminPush, type CancelTarget, type CoffeeAdminApi, type Done, type RecapData, type RecapQuery, type SettingsData } from "./api";
import { CancelDialog } from "./CancelDialog";
import { CoffeeAdminNav } from "./CoffeeAdminNav";
import { orderTitle } from "./format";
import { PushBar } from "./PushBar";
import { usePhone } from "./Layer";
import { ManualSheet } from "./ManualSheet";
import { MenuView } from "./MenuView";
import { QueueView } from "./QueueView";
import { RecapView } from "./RecapView";
import { RefuseDialog } from "./RefuseDialog";
import { COFFEE_ADMIN_LABEL, coffeeAdminSection, coffeeAdminSections, sectionOfPath, type CoffeeAdminSection, type CoffeeAdminSectionKey } from "./sections";
import { SettingsView } from "./SettingsView";
import { useQueue } from "./useQueue";
import css from "./coffee-admin.module.css";

export type CoffeeAdminInitial = { queue?: QueueState; recap?: { query: RecapQuery; data: RecapData }; settings?: SettingsData; menu?: MenuData };
type Toast = { tone: "success" | "error"; title: string; body?: string; undo?: QueueOrder };

/**
 * The pengelola's whole admin as one screen (25 Nov 2026): Antrean, Rekap, Menu (F6) and Pengaturan inside
 * Journey Admin's console frame. Like an app, the frame stays: choosing a section only changes
 * the address (history.pushState, which Next.js keeps in step) and shows that section; nothing
 * reloads, the back button walks back through them, and a section opened before shows at once
 * from what is kept and is refreshed quietly. The page the server sent brings the first
 * section's data; the others are read when first opened, with a skeleton where the data is not
 * there yet. On a phone a tab bar at the bottom replaces the menu and the forms come up as sheets.
 */
export function CoffeeAdminApp({ view: firstView, initial = {}, now: startedAt, personName, superAdmin = false, openManual = false, api = coffeeAdminClient, push: port = api === coffeeAdminClient ? coffeeAdminPush : null, routing = "history", tools }: {
  view: CoffeeAdminSectionKey; initial?: CoffeeAdminInitial;
  /** The server's clock when the page was drawn, so the first paint matches. */
  now: string;
  personName?: string; superAdmin?: boolean;
  /** The address asked for Catat manual (?catat=1). */
  openManual?: boolean;
  api?: CoffeeAdminApi;
  /**
   * Web push (F4): the push API and the device (usePush). With the real APIs it is the real thing;
   * the preview passes a make-believe one, and null leaves notifications out (the tests).
   */
  push?: PushPort | null;
  /** "memory": sections change without touching the address (the preview and the tests). */
  routing?: "history" | "memory";
  /** Shown above the section (the preview's buttons). */
  tools?: ReactNode;
}) {
  const phone = usePhone();
  const pathname = usePathname();
  const [memoryView, setMemoryView] = useState(firstView);
  const view = routing === "history" ? sectionOfPath(pathname) ?? firstView : memoryView;
  const [opened, setOpened] = useState<CoffeeAdminSectionKey[]>([firstView]);
  if (!opened.includes(view)) setOpened([...opened, view]);

  const [now, setNow] = useState(() => Date.parse(startedAt));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  const today = wibDay(new Date(now).toISOString());
  const actorName = superAdmin ? "Super admin" : firstName(personName ?? "") || "Admin";

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  /** The message on screen, for `notify` to look at without being made anew. */
  const shownToast = useRef<Toast | null>(null);
  useEffect(() => { shownToast.current = toast; }, [toast]);
  const notify = useCallback((next: Toast, quiet = false) => {
    // News that only informs never takes away a message that still offers Urungkan.
    if (quiet && shownToast.current?.undo) return;
    window.clearTimeout(toastTimer.current);
    setToast(next);
    // A success goes by itself; a problem stays until it is closed.
    if (next.tone === "success") toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /** Raised when an order changed: Rekap reads again the next time it is on screen. */
  const [version, setVersion] = useState(0);
  const onNew = useCallback((orders: QueueOrder[]) => {
    setVersion(value => value + 1);
    notify({
      tone: "success", title: orders.length === 1 ? "Pesanan baru masuk" : `${orders.length} pesanan baru masuk`,
      body: orders.map(order => order.kind === "klaim" ? `Klaim ${firstName(order.person.name)}` : `Rapat ${order.room || order.no}`).join(", "),
    }, true);
  }, [notify]);
  const queue = useQueue(api, initial.queue ?? null, onNew);
  const waiting = queue.state?.waiting.length ?? 0;

  const push = usePush(port);
  // Keluar: this device first lets go of the pengelola's notifications, then the button does its work.
  const released = useRef(false);
  const leave = (event: MouseEvent<HTMLElement>) => {
    const button = (event.target as HTMLElement).closest?.("button");
    if (!port || !button || released.current || push.state !== "on") return;
    event.preventDefault();
    event.stopPropagation();
    released.current = true;
    void dropPush(port).finally(() => button.click());
  };

  const [manual, setManual] = useState(openManual);
  const [refuse, setRefuse] = useState<QueueOrder | null>(null);
  // A sheet or a dialog takes the screen: a message left over from before would cover its buttons.
  const openManualSheet = () => { setToast(null); setManual(true); };
  const openRefuse = (order: QueueOrder) => { setToast(null); setRefuse(order); };
  const [cancel, setCancel] = useState<CancelTarget | null>(null);
  const openCancel = (target: CancelTarget) => { setToast(null); setCancel(target); };

  // Pengaturan's data: also what Catat manual reads the quotas from.
  const [settings, setSettings] = useState<SettingsData | null>(initial.settings ?? null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  // Read each time Pengaturan or Catat manual is opened (another pengelola may have changed the quotas);
  // what is already known stays on screen meanwhile. The page's own first data is not asked for twice.
  const needsSettings = view === "pengaturan" || manual;
  const settingsFresh = useRef(!!initial.settings);
  useEffect(() => {
    if (!needsSettings) return;
    if (settingsFresh.current) { settingsFresh.current = false; return; }
    let live = true;
    api.settings()
      .then(data => { if (live) { setSettings(data); setSettingsError(""); } })
      .catch((problem: unknown) => { if (live) setSettingsError(errorMessage(problem)); });
    return () => { live = false; };
  }, [api, needsSettings, settingsAttempt]);

  // Each section comes back where it was left; the title follows (no page load sets it).
  const scrolls = useRef<Partial<Record<CoffeeAdminSectionKey, number>>>({});
  useEffect(() => {
    document.title = `${coffeeAdminSection(view).label} · ${COFFEE_ADMIN_LABEL}`;
    window.scrollTo(0, scrolls.current[view] ?? 0);
  }, [view]);
  // The address that asked for Catat manual is tidied, so a reload does not open the sheet again.
  useEffect(() => {
    if (routing === "history" && new URLSearchParams(window.location.search).has("catat")) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [routing]);

  const go = (to: CoffeeAdminSectionKey) => {
    if (to === view) { window.scrollTo(0, 0); return; }
    scrolls.current[view] = window.scrollY;
    if (routing === "history") window.history.pushState({}, "", coffeeAdminSection(to).href);
    else setMemoryView(to);
  };
  /** A link to one of the sections (the menu, the drawer, the search, the tab bar) changes the section here instead of loading a page. */
  const intercept = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const to = sectionOfPath(url.pathname);
    if (!to) return;
    event.preventDefault();
    if (url.searchParams.get("catat") === "1") openManualSheet();
    go(to);
  };

  /** The card that held the focus left the queue (or its dialog closed onto nothing): the focus goes to the queue, not to the top of the page. */
  const focusQueue = () => window.setTimeout(() => {
    if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>("[data-coffee-focus]")?.focus();
  }, 0);
  const undo = async (order: QueueOrder) => {
    const result = await queue.reopen(order);
    if (!result.ok && result.ignored) return;
    setVersion(value => value + 1);
    notify(result.ok ? { tone: "success", title: "Dikembalikan ke antrean", body: orderTitle(order) } : { tone: "error", title: result.message });
  };
  const finish = async (order: QueueOrder) => {
    const sent = queue.finish(order);
    focusQueue();
    const result = await sent;
    // A second press that landed on the card that moved up: nothing was sent, nothing to say.
    if (!result.ok && result.ignored) return;
    setVersion(value => value + 1);
    notify(result.ok ? { tone: "success", title: "Selesai diproses", body: orderTitle(order), undo: result.order } : { tone: "error", title: result.message });
  };
  const reject = async (order: QueueOrder, note: string) => {
    setRefuse(null);
    const sent = queue.reject(order, note);
    focusQueue();
    const result = await sent;
    setVersion(value => value + 1);
    notify(result.ok
      ? { tone: "success", title: "Ditolak", body: `${orderTitle(order)}. Catatannya dibaca ${order.kind === "klaim" ? "pemesan. Jatah tidak terpakai." : "GA dan PIC."}`, undo: result.order }
      : { tone: "error", title: result.message });
  };
  /** Batalkan catatan, after the question: the record leaves "Baru diproses" and Rekap reads again. */
  const cancelRecord = async (target: CancelTarget) => {
    setCancel(null);
    try {
      const done = await api.cancelManual(target.id);
      queue.cancelled(done.order);
      notify({ tone: "success", title: "Catatan dibatalkan", body: `${target.title}.${target.claim ? ` Jatah ${firstName(done.order.person.name)} dikembalikan.` : ""}` });
    } catch (problem) {
      void queue.refresh();
      notify({ tone: "error", title: errorMessage(problem) });
    }
    setVersion(value => value + 1);
  };
  const saved = (done: Done) => {
    setManual(false);
    queue.recorded(done.order);
    void queue.refresh();
    setVersion(value => value + 1);
    notify({ tone: "success", title: "Dicatat manual", body: done.message });
  };

  // The service worker pushed a new order, or its notification was tapped: the queue reads now, and a tap shows it.
  useWorkerNews(news => {
    void queue.refresh();
    if (news.type === "open") go("antrean");
  }, port !== null);

  // The phone's bottom menu is the desktop menu: the same sections, labels and icons (26 Nov 2026). Catat manual is a button in Antrean's head.
  const tabLink = ({ key, label, href, icon: Icon }: CoffeeAdminSection) => (
    <a key={key} href={href} aria-current={view === key ? "page" : undefined}>
      <span className={css.tabIcon}><Icon size={22} aria-hidden />{key === "antrean" && waiting ? <span className={css.tabBadge}>{waiting}<span className={css.srOnly}> pesanan menunggu</span></span> : null}</span>
      {label}
    </a>
  );

  return (
    <div className={`${css.root} ${consoleThemeClass("admin")}`} onClickCapture={intercept}>
      <CoffeeAdminNav current={view} waiting={waiting} superAdmin={superAdmin} personName={personName} className={admin.shell} onLeave={leave}>
        {tools}
        {opened.includes("antrean") && (
          <div className={css.view} hidden={view !== "antrean"}>
            {port && <PushBar push={push} />}
            <QueueView
              queue={queue.state} error={queue.error} now={now} phone={phone} actorName={actorName} undoing={queue.undoing}
              onRetry={() => void queue.refresh()} onFinish={order => void finish(order)} onRefuse={openRefuse} onUndo={order => void undo(order)} onManual={openManualSheet} onCancel={openCancel}
            />
          </div>
        )}
        {opened.includes("rekap") && (
          <div className={css.view} hidden={view !== "rekap"}>
            <RecapView api={api} initial={initial.recap} today={today} phone={phone} active={view === "rekap"} version={version} onCancel={openCancel} />
          </div>
        )}
        {opened.includes("menu") && (
          <div className={css.view} hidden={view !== "menu"}>
            <MenuView api={api} initial={initial.menu} active={view === "menu"} onSaid={(tone, title, body) => notify({ tone, title, body })} />
          </div>
        )}
        {opened.includes("pengaturan") && (
          <div className={css.view} hidden={view !== "pengaturan"}>
            <SettingsView
              api={api} data={settings} error={settingsError} onRetry={() => { setSettingsError(""); setSettingsAttempt(value => value + 1); }}
              onSaved={(data, message) => { setSettings(data); setVersion(value => value + 1); notify({ tone: "success", title: message || "Jatah disimpan." }); }}
            />
          </div>
        )}
      </CoffeeAdminNav>

      <nav className={css.tabBar} aria-label="Menu pengelola (ponsel)">
        {coffeeAdminSections.map(tabLink)}
      </nav>

      {manual && <ManualSheet api={api} now={now} actorName={actorName} settings={settings?.settings ?? null} menu={settings?.menu} options={settings?.options} onClose={() => setManual(false)} onSaved={saved} />}
      {cancel && <CancelDialog target={cancel} onClose={() => setCancel(null)} onConfirm={() => void cancelRecord(cancel)} />}
      {refuse && <RefuseDialog order={refuse} onClose={() => setRefuse(null)} onRefuse={note => void reject(refuse, note)} />}

      <div className={css.toastRegion}>
        {toast && (
          <div className={css.toast} role={toast.tone === "error" ? "alert" : "status"}>
            {toast.tone === "error" ? <TriangleAlert size={20} aria-hidden /> : <Check size={20} aria-hidden />}
            <div><strong>{toast.title}</strong>{toast.body && <p>{toast.body}</p>}</div>
            {toast.undo && <button type="button" className={css.toastAction} disabled={queue.undoing.has(toast.undo.id)} onClick={() => { const order = toast.undo!; setToast(null); void undo(order); }}>Urungkan</button>}
            <button type="button" className={css.iconButton} aria-label="Tutup pemberitahuan" onClick={() => setToast(null)}><X size={18} aria-hidden /></button>
          </div>
        )}
      </div>
    </div>
  );
}
