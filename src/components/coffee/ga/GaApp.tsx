"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Coffee, Smartphone } from "lucide-react";
import type { GaState, MeetingOrder } from "@/lib/coffee/types";
import { coffeePath } from "@/lib/routes";
import { newKey } from "../api";
import { Layer } from "../Layer";
import { Toast, type ToastMessage } from "../Toast";
import { gaClient, type GaApi } from "./api";
import { GuestBook } from "./GuestBook";
import { Home } from "./Home";
import { MAX_LINES, canAddTo, counts, doneLine, nextDraft, toBody, type Draft, type Line } from "./model";
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
 * never loads a page. While the guest holds the tablet nothing but the menu book is on the page.
 */

type Screen = "home" | "new" | "quick" | "sent";

export type GaAppProps = {
  initial: GaState;
  /** Who is signed in on the tablet (the name only). */
  me: { name: string };
  /** The real APIs unless the preview or a test passes a make-believe one. */
  api?: GaApi;
  /** The preview's own buttons (not part of the app); never drawn while the guest holds the tablet. */
  tools?: ReactNode;
};

export function GaApp({ initial, me, api = gaClient, tools }: GaAppProps) {
  const [screen, setScreen] = useState<Screen>("home");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sentId, setSentId] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastNo = useRef(0);
  const say = useCallback((message: Omit<ToastMessage, "id">) => setToast({ ...message, id: ++toastNo.current }), []);
  const closeToast = useCallback(() => setToast(null), []);
  const askId = useId();
  /** One key per sending: kept for a retry of the same sending, new after an answer that settled it. */
  const key = useRef("");

  const open = useCallback((order: MeetingOrder) => { setSentId(order.id); setScreen("sent"); }, []);
  /** An order is being written: a message about another order does not take the screen away from it. */
  const writing = useRef(false);
  useEffect(() => { writing.current = screen === "new" || screen === "quick" || guest; }, [screen, guest]);
  /** An order was decided while the tablet was open. */
  const onDecided = useCallback((orders: MeetingOrder[]) => {
    const order = orders[0];
    const onOpen = writing.current ? undefined : () => open(order);
    say(order.status === "selesai"
      ? { tone: "ok", title: `#${order.no} ${order.room}: siap diambil`, body: `${doneLine(order)}. Ambil di mesin kopi pantry.`, onOpen }
      : { tone: "no", title: `#${order.no} ${order.room}: ditolak`, body: `${doneLine(order)}. Lihat catatannya.`, onOpen, sticky: true });
  }, [open, say]);
  const { state, refresh, send, sending } = useGa(api, initial, onDecided);
  const { today, people, rooms } = state;
  const sent = sentId ? today.find(order => order.id === sentId) : undefined;

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
    const ask = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsent]);

  const toHome = useCallback(() => {
    setLines([]); setDraft(null); setProblem(null); setAsking(false); setScreen("home");
    void refresh();
  }, [refresh]);
  /** Beranda: drinks that were not sent are only thrown away after a yes. */
  const leave = useCallback(() => { if (lines.length) setAsking(true); else toHome(); }, [lines.length, toHome]);

  const startRound = useCallback((order: MeetingOrder) => {
    const next = nextDraft(order, today);
    key.current = newKey();
    setDraft(next); setLines([]); setProblem(null);
    // A replacement order whose PIC is no longer an employee starts at the form, to pick another.
    setScreen(next.pic.id ? "quick" : "new");
  }, [today]);

  const begin = (next: Draft, withGuest: boolean) => {
    if (!key.current) key.current = newKey();
    setDraft(next); setProblem(null); setScreen("quick"); setGuest(withGuest);
  };

  const submit = useCallback(async () => {
    if (!draft || lines.length === 0) return;
    setProblem(null);
    if (!key.current) key.current = newKey();
    const result = await send(toBody(draft, lines, key.current));
    if (result.ok) {
      key.current = "";
      setLines([]); setSentId(result.order.id); setScreen("sent");
      say({ tone: "ok", title: result.message || "Pesanan terkirim ke pengelola." });
      return;
    }
    if (result.ignored) return;
    if (!result.stale) { setProblem(result.message); return; }
    // The server refused what this tablet believed: this sending is over, the next one is a new one.
    key.current = "";
    if (draft.parent) {
      setDraft({ ...draft, parent: undefined });
      setProblem(`${result.message} Tekan Kirim lagi untuk mengirimnya sebagai pesanan baru.`);
    } else setProblem(result.message);
  }, [draft, lines, say, send]);

  const backFromGuest = (picks: Line[]) => {
    setLines(list => [...list, ...picks].slice(0, MAX_LINES));
    setGuest(false);
    setScreen("quick");
  };

  if (guest && draft) return (
    <div className={`${css.ga} ${css.stage}`}>
      <GuestBook room={draft.room} picName={draft.pic.name} guest={draft.guest} max={Math.max(MAX_LINES - lines.length, 0)} onDone={backFromGuest} />
    </div>
  );

  return (
    <div className={`${css.ga} ${css.stage}`}>
      <header className={css.topbar}>
        <span className={css.brand}><Coffee aria-hidden size={22} />Werkudara Coffee<span className={css.brandSub}>Tablet GA</span></span>
        <span className={css.user}>
          <a className={css.topLink} href={coffeePath.home}><Smartphone aria-hidden size={18} />Aplikasi saya</a>
          <span className={css.userText}><strong>{me.name}</strong><span>Mode GA</span></span>
          <span className={css.avatar} aria-hidden>{me.name.trim().slice(0, 1).toUpperCase()}</span>
        </span>
      </header>

      <main ref={main} className={css.main} tabIndex={-1} data-coffee-focus>
        {screen === "home" && (
          <Home orders={today} rooms={rooms} onNew={() => { key.current = newKey(); setDraft(null); setLines([]); setProblem(null); setScreen("new"); }} onMore={startRound} onOpen={open} />
        )}
        {screen === "new" && (
          <NewOrder initial={draft} rooms={rooms} people={people} onBack={leave} onQuick={next => begin(next, false)} onGuest={next => begin(next, true)} />
        )}
        {screen === "quick" && draft && (
          <QuickInput draft={draft} lines={lines} setLines={setLines} people={people} sending={sending} problem={problem} onSend={submit}
            onGuest={() => setGuest(true)} onBack={() => { if (sending) return; if (draft.parent) leave(); else { setProblem(null); setScreen("new"); } }} />
        )}
        {screen === "sent" && (sent
          ? <Sent order={sent} more={canAddTo(sent, today)} onMore={() => startRound(sent)} onHome={toHome} />
          : (
            <div className={css.emptyState}>
              <h1>Pesanan ini sudah tidak ada di daftar hari ini</h1>
              <button type="button" className={css.primary} onClick={toHome}>Ke beranda</button>
            </div>
          ))}
      </main>

      {/* The employee app’s message card; here its close button is a tablet-sized target. */}
      <div className={css.toastWrap}><Toast message={toast} onClose={closeToast} /></div>

      {asking && (
        <Layer kind="dialog" alert labelledBy={askId} onClose={() => setAsking(false)} rootClass={css.ga} panelClass={css.askDialog}>
          <h2 id={askId}>Buang pesanan yang belum dikirim?</h2>
          <p>{counts(lines).total} minuman untuk {draft?.room} belum dikirim ke pengelola.</p>
          <div className={css.askFoot}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking(false)}>Lanjutkan pesanan</button>
            <button type="button" className={css.danger} onClick={toHome}>Buang</button>
          </div>
        </Layer>
      )}
      {tools}
    </div>
  );
}
