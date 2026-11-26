"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Bell, BellRing, CircleAlert, Coffee, LogOut, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { DEFAULT_OPTIONS, DRINKS } from "@/lib/coffee/menu";
import { pushNote } from "@/lib/coffee/notify";
import type { GaState, MeetingOrder } from "@/lib/coffee/types";
import { COFFEE_GA_ORDER, coffeePath } from "@/lib/routes";
import { CoffeeApiError, coffeePush, newKey } from "../api";
import { Layer, leavePage } from "../Layer";
import { coffeeWorker } from "../pwa";
import { Toast, type ToastMessage } from "../Toast";
import { dropPush, useFocusAfter, usePush, useWorkerNews, type PushPort } from "../usePush";
import { gaClient, type GaApi, type MeetingBody } from "./api";
import type { PinAnswer } from "./ExitDialog";
import { GuestBook } from "./GuestBook";
import { HOLD_REFRESH_MS, dropHold, keepHold, readHold, refreshHold, type BookState } from "./hold";
import { Home } from "./Home";
import { MAX_LINES, canAddTo, counts, doneLine, nextDraft, printOf, sameSending, toBody, type Draft, type Line } from "./model";
import { NewOrder } from "./NewOrder";
import { QuickInput } from "./QuickInput";
import { Sent } from "./Sent";
import { useGa } from "./useGa";
import css from "./ga.module.css";

/*
 * Mode GA on the office tablet (/coffee/ga): today's meeting orders, a new order (room and PIC),
 * Input cepat, the guest menu book, and the sent order with its live status. The server draws it
 * once with today's state; after that everything comes from the API (`api`, a prop, so the preview
 * and the tests run this same component on a make-believe server). Moving between the screens
 * never loads a page.
 *
 * While the guest holds the tablet nothing but the menu book is on the page, and that holds
 * through a reload, the back button and a pull on the page (audit F3-01, F3-04, F3-06):
 * - guest mode, the meeting, GA's unsent drinks and the guests' picks are kept (hold.ts) and
 *   restored; the server sends no GA data with a page that is reloaded in guest mode (`held`);
 * - nothing is read from the server while the book is open;
 * - the back button moves between the tablet's screens and closes dialogs; in the book it does nothing;
 * - leaving the book needs the PIN GA (a question while the pengelola has not set one).
 *
 * Web push (F4): "Nyalakan notifikasi" sits in the top bar beside "Aplikasi saya"; a notification
 * about a meeting order leads to /coffee/ga?pesanan=<id>, which opens that order's status. None of
 * it exists while the guest holds the tablet: nothing is drawn, asked, registered or listened to,
 * and a notification that is tapped then leaves the book where it is. (What the notification
 * itself says in guest mode is the service worker's doing: one neutral line, see public/coffee/sw.js.)
 * After the final audit: "Matikan" beside "Notifikasi aktif" (F5-07), the focus follows Nyalakan and
 * Matikan (F5-09), and the guest-mode cookie is written again while the book is open (F5-06).
 *
 * Keluar (26 Nov 2026): the tablet has its own sign-in (/coffee/ga/masuk), so it has its own way
 * out, in the top bar after "Aplikasi saya". It asks first (and warns about drinks that were not
 * sent), lets go of this device's notifications as the employee app does, ends the session and
 * opens the tablet's sign-in; meanwhile nothing of the person or of today's orders stays on screen.
 * It does not exist in the guest's book: leaving the book still takes the PIN GA.
 */

type Screen = "home" | "new" | "quick" | "sent";
/** A sending that has a key: its exact contents, and what was on the list when it first went out. */
type Pending = { key: string; print: string; body: MeetingBody; before: Set<string>; unsure: boolean };

export type GaAppProps = {
  initial: GaState;
  /** Who is signed in on the tablet (the name only). */
  me: { name: string };
  /** The real APIs unless the preview or a test passes a make-believe one. */
  api?: GaApi;
  /** The page was loaded while a guest held the tablet (the server saw the cookie): it opens on the menu book, and `initial` holds no GA data. */
  held?: boolean;
  /** The order the address named (?pesanan=<id>, where a notification leads): its status opens first, unless a guest holds the tablet. */
  openId?: string;
  /** Web push (F4): the real thing with the real APIs; the preview passes a make-believe one, and null leaves it out (the tests). */
  push?: PushPort | null;
  /** The preview's own buttons (not part of the app); never drawn while the guest holds the tablet. */
  tools?: ReactNode;
};

const TRAP = "gaTrap";
const layerOpen = () => !!document.querySelector("[data-coffee-layer]");

export function GaApp({ initial, me, api = gaClient, held = false, openId, push: port = api === gaClient ? coffeePush : null, tools }: GaAppProps) {
  const named = !held && openId && initial.today.some(order => order.id === openId) ? openId : null;
  const [screen, setScreen] = useState<Screen>(named ? "sent" : "home");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sentId, setSentId] = useState<string | null>(named);
  const [guest, setGuest] = useState(held);
  /** What the guests picked so far, as the book last told (kept for a reload). */
  const [book, setBook] = useState<BookState | undefined>(undefined);
  /** The tab's storage was looked at (it exists only in the browser, after the first paint). */
  const [restored, setRestored] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** A question before unsent drinks are thrown away; `then` is what the yes goes on to. */
  const [asking, setAsking] = useState<{ then: () => void } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastNo = useRef(0);
  /** A plain message that arrived while a refusal was showing: it waits its turn instead of covering it. */
  const queued = useRef<ToastMessage | null>(null);
  const say = useCallback((message: Omit<ToastMessage, "id">) => {
    const next = { ...message, id: ++toastNo.current };
    setToast(current => {
      if (current?.sticky && !next.sticky) { queued.current = next; return current; }
      return next;
    });
  }, []);
  const closeToast = useCallback(() => { const next = queued.current; queued.current = null; setToast(next); }, []);
  const askId = useId(), outId = useId();
  /** Keluar: the question is open; the session is being ended; why it could not be; it ended (nothing of GA is drawn any more). */
  const [outAsk, setOutAsk] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [outError, setOutError] = useState("");
  const [left, setLeft] = useState(false);
  /** The sign-in page is on its way: the browser must not ask about unsent drinks the person just agreed to drop. */
  const going = useRef(false);
  const pending = useRef<Pending | null>(null);
  const checking = useRef(false);

  const open = useCallback((order: MeetingOrder) => { setSentId(order.id); setScreen("sent"); }, []);
  /** An order is being written: a message about another order does not take the screen away from it. */
  const writing = useRef(false);
  useEffect(() => { writing.current = screen === "new" || screen === "quick" || guest; }, [screen, guest]);
  /** Orders were decided while the tablet was open. Tapping the message opens the order, unless one is being written by then. */
  const onDecided = useCallback((orders: MeetingOrder[]) => {
    const refused = orders.filter(order => order.status === "ditolak");
    if (orders.length > 1) {
      say({
        tone: refused.length ? "no" : "ok", sticky: refused.length > 0,
        title: `${orders.length} pesanan sudah diputuskan${refused.length ? `, ${refused.length} ditolak` : ""}`,
        body: orders.map(order => `#${order.no} ${order.room || "Tanpa ruangan"}: ${order.status === "ditolak" ? "ditolak" : "siap diambil"}`).join(" · "),
      });
      return;
    }
    const order = orders[0];
    const onOpen = () => { if (!writing.current) open(order); };
    say(order.status === "selesai"
      ? { tone: "ok", title: `#${order.no} ${order.room}: siap diambil`, body: `${doneLine(order)}. Ambil di mesin kopi pantry.`, onOpen }
      : { tone: "no", title: `#${order.no} ${order.room}: ditolak`, body: `${doneLine(order)}. Lihat catatannya.`, onOpen, sticky: true });
  }, [open, say]);
  const { state, refresh, send, sending, stale, retry, retrying } = useGa(api, initial, onDecided, guest || left);
  const { today, people, rooms } = state;
  // The menu and what the team and guests are asked come with the state (F6); the code's menu and the defaults only if an answer ever lacks them.
  const menu = state.menu ?? DRINKS, options = state.options ?? DEFAULT_OPTIONS;
  const sent = sentId ? today.find(order => order.id === sentId) : undefined;

  // Web push. Paused in guest mode: the device is not asked, the worker not registered, its messages not heard.
  const push = usePush(port, guest);
  useEffect(() => { if (api === gaClient && !guest) void coffeeWorker(); }, [api, guest]);
  useWorkerNews(news => {
    void refresh().then(fresh => {
      if (news.type !== "open") return;
      const id = new URLSearchParams(news.url.split("?")[1] ?? "").get(COFFEE_GA_ORDER);
      const order = id ? (fresh?.today ?? today).find(item => item.id === id) : undefined;
      // An order that is being written keeps the screen, as with the message on top.
      if (order && !writing.current) open(order);
    });
  }, port !== null && !guest);
  const { target: pushButton, follow } = useFocusAfter<HTMLButtonElement>(!push.busy, push.state);
  const turnOff = async () => {
    if (push.busy) return;
    follow();
    await push.disable();
    say({ tone: "ok", title: "Notifikasi dimatikan di tablet ini", body: "Status pesanan tetap berubah sendiri di layar ini." });
  };
  const turnOn = async () => {
    if (push.busy) return;
    follow();
    if (push.state !== "off") { say({ tone: "no", title: "Notifikasi belum bisa dinyalakan", body: pushNote(push.state, "ga"), sticky: true }); return; }
    const answer = await push.enable();
    if (answer === "granted") say({ tone: "ok", title: "Notifikasi aktif di tablet ini", body: "Tablet diberi tahu begitu pesanan rapat selesai diproses." });
    else say({
      tone: "no", title: "Notifikasi belum menyala", sticky: true,
      body: answer === "denied"
        ? "Izin notifikasi belum diberikan. Bila browser tidak bertanya lagi: buka pengaturan situs (ikon di kiri alamat) → Notifikasi → Izinkan, lalu muat ulang halaman."
        : "Notifikasi belum bisa dinyalakan di tablet ini. Tablet tetap jalan: status pesanan berubah sendiri di layar ini.",
    });
  };

  // After a reload: back into the book with what was kept; or, when the server saw guest mode but
  // nothing can be restored, locked on the cover until the GA officer leaves it.
  // What was kept is checked against the menu and options the page came with (a drink that left the menu is dropped).
  const [holdRules] = useState(() => ({ menu: initial.menu ?? DRINKS, options: initial.options ?? DEFAULT_OPTIONS }));
  useEffect(() => {
    const kept = readHold(holdRules);
    /* eslint-disable react-hooks/set-state-in-effect -- the tab's storage exists only in the browser, after the first paint */
    if (kept) { setDraft(kept.draft); setLines(kept.lines); setBook(kept.book); setGuest(true); setScreen("quick"); }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [holdRules]);
  // Guest mode is remembered while it lasts, and forgotten the moment the GA officer is back.
  useEffect(() => {
    if (!restored) return;
    if (guest) keepHold(draft ? { draft, lines, book: book ?? { open: false, picks: [] } } : null);
    else dropHold();
  }, [restored, guest, draft, lines, book]);
  // The cookie lives twelve hours and a book can stay open longer: it is written again every half
  // hour and whenever the tablet is looked at again, so a reload in guest mode never brings GA's data.
  useEffect(() => {
    if (!restored || !guest) return;
    const again = () => { if (document.visibilityState !== "hidden") refreshHold(); };
    const timer = window.setInterval(refreshHold, HOLD_REFRESH_MS);
    document.addEventListener("visibilitychange", again);
    window.addEventListener("pageshow", again);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", again); window.removeEventListener("pageshow", again); };
  }, [restored, guest]);

  // A pull on the page must not reload it (the cover does not scroll, so Chrome would take the pull for a refresh).
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const before = targets.map(element => element.style.overscrollBehavior);
    targets.forEach(element => { element.style.overscrollBehavior = "none"; });
    return () => targets.forEach((element, index) => { element.style.overscrollBehavior = before[index]; });
  }, []);

  // The screen changed: the focus goes to it, not to nowhere (the button that was pressed is gone).
  const main = useRef<HTMLElement>(null);
  const shown = useRef(`${screen}:${guest}`);
  useEffect(() => {
    const now = `${screen}:${guest}`;
    if (shown.current === now) return;
    shown.current = now;
    if (!guest) main.current?.focus({ preventScroll: true });
  }, [screen, guest]);

  // Drinks that were not sent yet: the browser asks before the page is left or reloaded.
  const unsent = lines.length > 0 || guest;
  useEffect(() => {
    if (!unsent) return;
    const ask = (event: BeforeUnloadEvent) => { if (!going.current) event.preventDefault(); };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsent]);

  const toHome = useCallback(() => {
    pending.current = null;
    setLines([]); setDraft(null); setProblem(null); setAsking(null); setScreen("home");
    void refresh();
  }, [refresh]);
  /** Drinks that were not sent are only thrown away after a yes, whatever asks for it. */
  const discardThen = useCallback((then: () => void) => { if (lines.length) setAsking({ then }); else then(); }, [lines.length]);
  const leave = useCallback(() => discardThen(toHome), [discardThen, toHome]);

  const startRound = useCallback((order: MeetingOrder) => {
    const next = nextDraft(order, today);
    pending.current = null;
    setDraft(next); setLines([]); setProblem(null); setAsking(null);
    // A replacement order whose PIC is no longer an employee starts at the form, to pick another.
    setScreen(next.pic.id ? "quick" : "new");
  }, [today]);

  const begin = (next: Draft, withGuest: boolean) => { setDraft(next); setProblem(null); setScreen("quick"); setGuest(withGuest); if (withGuest) setBook(undefined); };

  const submit = useCallback(async () => {
    if (!draft || lines.length === 0 || checking.current) return;
    setProblem(null);
    const print = printOf(draft, lines);
    const before = pending.current;
    if (before && before.print !== print) {
      // The order was changed after a Kirim. When that Kirim got no answer it may still have arrived:
      // find out first, or its drinks would be sent a second time under the new key.
      if (before.unsure) {
        checking.current = true;
        const fresh = await refresh();
        checking.current = false;
        if (!fresh) { setProblem("Belum tersambung, jadi belum diketahui apakah kiriman sebelumnya sudah masuk. Periksa jaringan, lalu tekan Kirim lagi."); return; }
        const arrived = fresh.today.find(order => !before.before.has(order.id) && sameSending(order, before.body));
        if (arrived) {
          pending.current = null;
          const next = nextDraft(arrived, fresh.today);
          setDraft(current => current && next.parent ? { ...current, parent: next.parent } : current);
          setProblem(`Kiriman sebelumnya ternyata sudah masuk sebagai #${arrived.no} (${counts(arrived.items).total} minuman). Hapus minuman yang sudah terkirim dari daftar ini, lalu tekan Kirim untuk menambahkan sisanya.`);
          return;
        }
      }
      // Other contents are another sending: a key of its own.
      pending.current = null;
    }
    const body = toBody(draft, lines, pending.current?.key ?? newKey());
    pending.current ??= { key: body.key, print, body, before: new Set(today.map(order => order.id)), unsure: false };
    const result = await send(body);
    if (result.ok) {
      pending.current = null;
      setLines([]); setSentId(result.order.id); setScreen("sent");
      say({ tone: "ok", title: result.message || "Pesanan terkirim ke pengelola." });
      return;
    }
    if (result.ignored) return;
    // No answer at all: the same contents go out again under the same key.
    if (result.unsure) { if (pending.current) pending.current.unsure = true; setProblem(result.message); return; }
    // A definite refusal: this sending is over, the next one is a new one.
    pending.current = null;
    if (!result.stale) { setProblem(result.message); return; }
    if (draft.parent) {
      setDraft({ ...draft, parent: undefined });
      setProblem(`${result.message} Tekan Kirim lagi untuk mengirimnya sebagai pesanan baru.`);
    } else setProblem(`${result.message} Tekan Kirim lagi.`);
  }, [draft, lines, refresh, say, send, today]);

  const signOut = async () => {
    if (going.current) return;
    going.current = true;
    setLeaving(true); setOutError("");
    // This tablet stops getting this person's notifications before the session ends (afterwards the server would not listen).
    await dropPush(port);
    try { await api.signOut(); }
    catch (failure) {
      // The server was not told: the session still lives, so the question stays and says so.
      going.current = false;
      setLeaving(false);
      setOutError(failure instanceof CoffeeApiError ? failure.message : "Belum bisa keluar. Periksa jaringan lalu coba lagi.");
      return;
    }
    // The sign-in page is on its way. The dialog must not walk the history back now (that would cancel
    // the navigation), and nothing of this person or of today's orders stays on the screen meanwhile.
    leavePage();
    pending.current = null;
    setLines([]); setDraft(null); setOutAsk(false); setLeft(true);
  };

  const backFromGuest = (picks: Line[]) => {
    setLines(list => [...list, ...picks].slice(0, MAX_LINES));
    setGuest(false); setBook(undefined);
    // Reloaded in guest mode with nothing to restore: back to Beranda. useGa reads GA's data now (none came with such a page).
    setScreen(draft ? "quick" : "home");
  };
  /** The PIN GA, asked of the server: the page never knows it. */
  const checkPin = useCallback(async (pin: string): Promise<PinAnswer> => {
    try { await api.checkPin(pin); return { ok: true }; }
    catch (failure) {
      if (failure instanceof CoffeeApiError && failure.status === 409) return { ok: false, message: failure.message, unset: true };
      return { ok: false, message: failure instanceof CoffeeApiError ? failure.message : "PIN belum bisa diperiksa. Coba lagi." };
    }
  }, [api]);

  // The back button (Android's, or a swipe from the edge): one screen back, or the dialog closed.
  // In the book it does nothing at all. One entry of the history is kept under the tablet for it.
  const onBack = useRef<() => boolean>(() => false);
  useEffect(() => {
    onBack.current = () => {
      if (layerOpen()) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true; }
      if (guest) return true;
      if (asking) { setAsking(null); return true; }
      if (sending) return true;
      if (screen === "quick" && draft) { if (draft.parent) leave(); else { setProblem(null); setScreen("new"); } return true; }
      if (screen === "new") { leave(); return true; }
      if (screen === "sent") { leave(); return true; }
      return false;
    };
  });
  useEffect(() => {
    const trap = () => { if (!window.history.state?.[TRAP]) window.history.pushState({ ...window.history.state, [TRAP]: true }, ""); };
    // The address that named an order is tidied, so a reload opens Beranda and not that order again.
    if (new URLSearchParams(window.location.search).has(COFFEE_GA_ORDER)) window.history.replaceState(window.history.state, "", window.location.pathname);
    trap();
    const onPop = () => {
      // Still on (or above) the tablet's own entry: a layer's entry was closed, not ours.
      if (window.history.state?.[TRAP]) return;
      if (onBack.current()) trap();
      // Beranda with nothing open: the back button leaves the tablet page, as it would without us.
      else window.history.back();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (left) return (
    <div className={`${css.ga} ${css.stage}`} data-left>
      <div className={css.emptyState} role="status">
        <h1>Kamu sudah keluar</h1>
        <p>Membuka halaman masuk tablet…</p>
        {/* A plain link: the way on when the browser did not move by itself. */}
        <a className={css.primary} href={coffeePath.gaLogin()}>Masuk lagi</a>
      </div>
    </div>
  );

  if (guest) return (
    <div className={`${css.ga} ${css.stage}`} data-guest>
      {restored
        ? <GuestBook key={draft ? "book" : "locked"} room={draft?.room ?? ""} picName={draft?.pic.name ?? ""} guest={draft?.guest} max={Math.max(MAX_LINES - lines.length, 0)}
            menu={menu} options={options.tamu} saved={book} locked={!draft} exit={{ pin: state.pin, check: checkPin }} onKeep={setBook} onDone={backFromGuest} />
        // Before the tab's storage was read: the closed cover, the same on the server and in the browser.
        : <div className={css.book} role="region" aria-label="Buku menu tamu"><div className={css.cover} aria-hidden><span className={css.coverFrame} /><span className={css.goldMark} /></div></div>}
    </div>
  );

  return (
    <div className={`${css.ga} ${css.stage}`}>
      <header className={css.topbar}>
        <span className={css.brand}><Coffee aria-hidden size={22} />WG Coffee<span className={css.brandSub}>Tablet GA</span></span>
        <span className={css.user}>
          {port && push.state === "on" && <>
            <span className={css.topNote}><BellRing aria-hidden size={18} /><span>Notifikasi aktif</span></span>
            <button type="button" ref={pushButton} className={`${css.topLink} ${css.topOff}`} aria-label="Matikan notifikasi di tablet ini" aria-disabled={push.busy || undefined} onClick={() => void turnOff()}>Matikan</button>
          </>}
          {port && (push.state === "off" || push.state === "denied" || push.state === "ios-install" || push.state === "unsupported") && (
            <button type="button" ref={pushButton} className={css.topLink} aria-disabled={push.busy || undefined} onClick={() => void turnOn()}><Bell aria-hidden size={18} /><span>Nyalakan notifikasi</span></button>
          )}
          <a className={css.topLink} href={coffeePath.home}><Smartphone aria-hidden size={18} /><span>Aplikasi saya</span></a>
          <button type="button" className={css.topLink} aria-disabled={sending || undefined} onClick={() => { if (!sending) { setOutError(""); setOutAsk(true); } }}><LogOut aria-hidden size={18} /><span>Keluar</span></button>
          <span className={css.userText}><strong>{me.name}</strong><span>Mode GA</span></span>
          <span className={css.avatar} aria-hidden>{me.name.trim().slice(0, 1).toUpperCase()}</span>
        </span>
      </header>

      {stale && (
        <div className={css.offline} role="status">
          <WifiOff aria-hidden size={18} />
          <span>Tidak tersambung. Status mungkin belum terbaru.</span>
          <button type="button" aria-disabled={retrying || undefined} onClick={() => void retry()}><RefreshCw aria-hidden size={16} />{retrying ? "Memuat…" : "Coba lagi"}</button>
        </div>
      )}

      <main ref={main} className={css.main} tabIndex={-1} data-coffee-focus>
        {screen === "home" && (
          <Home orders={today} rooms={rooms} pin={state.pin} onNew={() => { pending.current = null; setDraft(null); setLines([]); setProblem(null); setScreen("new"); }} onMore={startRound} onOpen={open} />
        )}
        {screen === "new" && (
          <NewOrder initial={draft} rooms={rooms} people={people} onBack={leave} onQuick={next => begin(next, false)} onGuest={next => begin(next, true)} />
        )}
        {screen === "quick" && draft && (
          <QuickInput draft={draft} lines={lines} setLines={setLines} people={people} menu={menu} options={options} sending={sending} problem={problem} onSend={submit}
            onGuest={() => { setBook(undefined); setGuest(true); }} onBack={() => { if (sending) return; if (draft.parent) leave(); else { setProblem(null); setScreen("new"); } }} />
        )}
        {screen === "sent" && (sent
          ? <Sent order={sent} more={canAddTo(sent, today)} onMore={() => discardThen(() => startRound(sent))} onHome={leave} />
          : (
            <div className={css.emptyState}>
              <h1>Pesanan ini sudah tidak ada di daftar hari ini</h1>
              <button type="button" className={css.primary} onClick={leave}>Ke beranda</button>
            </div>
          ))}
      </main>

      {/* The employee app’s message card; here its close button is a tablet-sized target. */}
      <div className={css.toastWrap}><Toast message={toast} onClose={closeToast} /></div>

      {asking && (
        <Layer kind="dialog" alert labelledBy={askId} onClose={() => setAsking(null)} rootClass={css.ga} panelClass={css.askDialog}>
          <h2 id={askId}>Buang pesanan yang belum dikirim?</h2>
          <p>{counts(lines).total} minuman untuk {draft?.room} belum dikirim ke pengelola.</p>
          <div className={css.askFoot}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking(null)}>Lanjutkan pesanan</button>
            <button type="button" className={css.danger} onClick={asking.then}>Buang</button>
          </div>
        </Layer>
      )}
      {outAsk && (
        <Layer kind="dialog" alert labelledBy={outId} onClose={() => { if (!leaving) setOutAsk(false); }} rootClass={css.ga} panelClass={css.askDialog}>
          <h2 id={outId}>Keluar dari tablet ini?</h2>
          {lines.length > 0 && (
            <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{counts(lines).total} minuman untuk {draft?.room} belum dikirim ke pengelola. Kalau keluar sekarang, minuman itu dibuang.</span></p>
          )}
          <p>{me.name} keluar dari Mode GA di tablet ini, dan notifikasi di tablet ini berhenti. Orang berikutnya masuk dengan akunnya sendiri.</p>
          {outError && <p className={css.pinSaid} role="alert">{outError}</p>}
          <div className={css.askFoot}>
            <button type="button" className={css.secondary} data-autofocus aria-disabled={leaving || undefined} onClick={() => { if (!leaving) setOutAsk(false); }}>{lines.length > 0 ? "Kembali ke pesanan" : "Batal"}</button>
            <button type="button" className={css.danger} aria-disabled={leaving || undefined} onClick={() => void signOut()}><LogOut aria-hidden size={18} />{leaving ? "Keluar…" : lines.length > 0 ? "Buang dan keluar" : "Keluar"}</button>
          </div>
        </Layer>
      )}
      {tools}
    </div>
  );
}
