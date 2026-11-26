import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { coffeePath } from "@/lib/routes";
import { CoffeeLogin, CoffeeTrouble, CoffeeWaiting } from "./CoffeeAuth";
import { Layer, onLayerEntry, stayOnPage } from "./Layer";
import { activeCoffeeWorker, coffeeWorker, forgetCoffeeWorker } from "./pwa";
import { browserDevice } from "./usePush";
import { SetupSteps } from "./SetupSteps";
import { TOAST_MS, Toast, type ToastMessage } from "./Toast";

/*
 * The small parts of the employee app the F2 audit found without a test of their own (26 Nov
 * 2026): the sheet and the question (Layer), the message on top (Toast), the focus between the
 * steps of "Atur sekali" and of signing in, the service worker's registration, and the two screens
 * the server shows instead of the app.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const phone = (on: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: on, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
const soon = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); stayOnPage(); forgetCoffeeWorker(); window.history.replaceState({}, ""); });

function Sheets({ ask = false }: { ask?: boolean }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(false);
  return (
    <div>
      <main tabIndex={-1} data-coffee-focus><button type="button" onClick={() => setOpen(true)}>Buka</button></main>
      {open && (
        <Layer labelledBy="judul" onClose={() => setOpen(false)}>
          <h2 id="judul">Lembar</h2>
          <button type="button">Satu</button>
          <button type="button" data-autofocus onClick={() => ask && setQuestion(true)}>Dua</button>
        </Layer>
      )}
      {question && (
        <Layer kind="dialog" alert labelledBy="tanya" onClose={() => setQuestion(false)}>
          <h2 id="tanya">Yakin?</h2>
          <button type="button">Ya</button>
        </Layer>
      )}
    </div>
  );
}

it("Layer: Escape closes, Tab stays inside, the focus goes back, the page behind is out of reach", () => {
  phone(false);
  render(<Sheets />);
  const opener = screen.getByRole("button", { name: "Buka" });
  opener.focus();
  fireEvent.click(opener);
  const sheet = screen.getByRole("dialog", { name: "Lembar" });
  expect(sheet.getAttribute("aria-modal")).toBe("true");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dua" }));
  expect(opener.closest("body > *")?.hasAttribute("inert")).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  // No history entry on a wide screen.
  expect(onLayerEntry()).toBe(false);
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Satu" }));
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dua" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(opener.closest("body > *")?.hasAttribute("inert")).toBe(false);
  expect(document.body.style.overflow).toBe("");
});

it("Layer: only the one on top answers, and a press outside closes it", () => {
  phone(false);
  render(<Sheets ask />);
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  fireEvent.click(screen.getByRole("button", { name: "Dua" }));
  const question = screen.getByRole("alertdialog", { name: "Yakin?" });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("dialog", { name: "Lembar" })).toBeTruthy();
  expect(question.isConnected).toBe(false);
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Layer: on a phone the back gesture closes the sheet instead of leaving the page", async () => {
  phone(true);
  const length = window.history.length;
  render(<Sheets />);
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  expect(onLayerEntry()).toBe(true);
  expect(window.history.length).toBe(length + 1);
  await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onLayerEntry()).toBe(false);
});

it("Toast: leaves by itself after six seconds, stays when something went wrong, opens what it points at", () => {
  vi.useFakeTimers();
  const onClose = vi.fn(), onOpen = vi.fn();
  const message = (more: Partial<ToastMessage>): ToastMessage => ({ id: 1, tone: "ok", title: "Pengajuan terkirim.", ...more });
  const { rerender } = render(<Toast message={null} onClose={onClose} />);
  // The region is there before anything is said.
  expect(screen.getByRole("status").textContent).toBe("");
  rerender(<Toast message={message({})} onClose={onClose} />);
  act(() => { vi.advanceTimersByTime(TOAST_MS - 1); });
  expect(onClose).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1); });
  expect(onClose).toHaveBeenCalledTimes(1);

  rerender(<Toast message={message({ id: 2, tone: "no", title: "Tidak bisa dibatalkan", sticky: true })} onClose={onClose} />);
  act(() => { vi.advanceTimersByTime(TOAST_MS * 5); });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Tutup pesan" }));
  expect(onClose).toHaveBeenCalledTimes(2);

  rerender(<Toast message={message({ id: 3, title: "Silakan ambil di mesin", onOpen })} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: /Silakan ambil di mesin/ }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(3);
});

it("F2-15 moves the focus to the new step of Atur sekali", () => {
  render(<SetupSteps phone="iphone" installed={false} onDone={() => undefined} />);
  // The first step leaves the focus alone (the page has just loaded).
  expect(document.activeElement).toBe(document.body);
  fireEvent.click(screen.getByRole("button", { name: "Sudah, lanjut" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Notifikasi" }));
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Pasang di layar utama" }));
});

it("F2-15 puts the focus in the email field after the welcome, and back on Masuk", () => {
  render(<CoffeeLogin next={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Masuk" }));
});

it("F2-11 keeps the technical detail off the 'belum dibuka' screen unless it is passed, and offers a way to try again on trouble", () => {
  render(<CoffeeWaiting />);
  expect(screen.getByRole("heading", { level: 1, name: "Werkudara Coffee belum dibuka" })).toBeTruthy();
  expect(screen.queryByText(/Rincian untuk admin/)).toBeNull();
  cleanup();
  render(<CoffeeWaiting detail="Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." />);
  expect(screen.getByText(/Rincian untuk admin: Werkudara Coffee menunggu migrasi/)).toBeTruthy();
  cleanup();
  render(<CoffeeTrouble here={coffeePath.orders} />);
  expect(screen.getByRole("heading", { level: 1, name: "Belum bisa memuat" })).toBeTruthy();
  expect(screen.queryByText(/belum dibuka/)).toBeNull();
  expect(screen.getByRole("link", { name: "Coba lagi" }).getAttribute("href")).toBe(coffeePath.orders);
});

it("F2-04 registers the worker once with the app's own address as scope, and lets go of the old /coffee/ registration", async () => {
  const unregister = vi.fn(async () => true);
  const registration = { scope: `http://localhost${coffeePath.scope}` };
  const register = vi.fn(async () => registration);
  const getRegistration = vi.fn(async () => ({ scope: `http://localhost${coffeePath.oldScope}`, unregister }));
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register, getRegistration } });
  expect(await coffeeWorker()).toBe(registration);
  expect(await coffeeWorker()).toBe(registration);
  expect(register).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledWith(coffeePath.serviceWorker, { scope: "/coffee" });
  expect(getRegistration).toHaveBeenCalledWith(coffeePath.oldScope);
  expect(unregister).toHaveBeenCalledTimes(1);
  await soon();
});

it("F2-04 leaves a registration that already has the new scope alone, and never throws", async () => {
  const unregister = vi.fn(async () => true);
  const register = vi.fn(async () => { throw new Error("SecurityError"); });
  // getRegistration("/coffee/") answers with the /coffee registration when there is no /coffee/ one.
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register, getRegistration: async () => ({ scope: `http://localhost${coffeePath.scope}`, unregister }) } });
  expect(await coffeeWorker()).toBeNull();
  expect(unregister).not.toHaveBeenCalled();
  // A failed registration is tried again the next time it is asked for.
  expect(await coffeeWorker()).toBeNull();
  expect(register).toHaveBeenCalledTimes(2);
  vi.stubGlobal("navigator", { userAgent: "x" });
  forgetCoffeeWorker();
  expect(await coffeeWorker()).toBeNull();
});

// Audit F5-03: register() answers before the worker is active, and pushManager.subscribe() refuses until it is.
function installingWorker() {
  const listeners = new Set<() => void>();
  const worker = { state: "installing", addEventListener: (_: string, listener: () => void) => { listeners.add(listener); }, removeEventListener: (_: string, listener: () => void) => { listeners.delete(listener); } };
  const subscribe = vi.fn(async () => { if (!registration.active) throw new DOMException("no active Service Worker", "AbortError"); return { endpoint: "https://fcm.googleapis.com/fcm/send/x" }; });
  const registration: { scope: string; active: unknown; installing: unknown; waiting: unknown; pushManager: unknown } = { scope: `http://localhost${coffeePath.scope}`, active: null, installing: worker, waiting: null, pushManager: { subscribe, getSubscription: async () => null } };
  const to = (state: string) => {
    worker.state = state;
    if (state === "activated") { registration.active = worker; registration.installing = null; }
    [...listeners].forEach(listener => listener());
  };
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register: async () => registration, getRegistration: async () => undefined } });
  return { registration, subscribe, to, listeners };
}

it("F5-03 waits for the worker to be active before subscribing, so the first press works on a browser that never opened the app", async () => {
  const { subscribe, to, listeners } = installingWorker();
  let done = false;
  const pressed = browserDevice.subscribe("BContohKunciPublik").then(result => { done = true; return result; });
  await soon();
  // Still installing: nothing was asked of the push manager yet.
  expect(subscribe).not.toHaveBeenCalled();
  expect(done).toBe(false);
  to("installed"); to("activating");
  await soon();
  expect(subscribe).not.toHaveBeenCalled();
  to("activated");
  await expect(pressed).resolves.toMatchObject({ endpoint: "https://fcm.googleapis.com/fcm/send/x" });
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
});

it("F5-03 does not wait when the worker is already active, and gives up waiting after a while", async () => {
  const active = installingWorker();
  active.to("activated");
  expect(await activeCoffeeWorker()).toBe(active.registration);
  forgetCoffeeWorker();
  // A worker that never gets there: the wait ends (here after 20 ms) and the caller goes on, to fail in the open.
  const stuck = installingWorker();
  const started = Date.now();
  expect(await activeCoffeeWorker(20)).toBe(stuck.registration);
  expect(Date.now() - started).toBeLessThan(2_000);
  expect(stuck.listeners.size).toBe(0);
  forgetCoffeeWorker();
  // A worker that failed to install (redundant) ends the wait at once.
  const broken = installingWorker();
  const waiting = activeCoffeeWorker(60_000);
  await soon();
  broken.to("redundant");
  expect(await waiting).toBe(broken.registration);
});
