import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { COFFEE_GA_ORDER, coffeePath } from "@/lib/routes";
import { samplePush } from "../pushSample";
import { GaApp } from "./GaApp";
import { SAMPLE_GA, SAMPLE_PEOPLE, createSampleGa } from "./sample";
import { forget, NOW, rest } from "./testing";

/*
 * Web push on GA's tablet (F4) on a make-believe device: "Nyalakan notifikasi" in the top bar, the
 * order a notification leads to, and that none of it exists while a guest holds the tablet.
 * No real service worker or permission is involved; those are for a real tablet.
 */
type Port = ReturnType<typeof samplePush>;
function open(port: Port | null, more: { held?: boolean; openId?: string } = {}) {
  const server = createSampleGa({ seeded: true });
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send), checkPin: vi.fn(server.api.checkPin) };
  const initial = server.initial();
  render(<GaApp initial={more.held ? { today: [], people: [], rooms: [], pin: false } : initial} me={{ name: SAMPLE_GA }} api={api} push={port} {...more} tools={<p>kotak pratinjau</p>} />);
  rest();
  return { server, api, initial };
}
const press = (name: string | RegExp) => { fireEvent.click(screen.getByRole("button", { name })); rest(); };
const news = (data: unknown) => act(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const topbar = () => within(screen.getByRole("banner"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(NOW));
  Object.defineProperty(navigator, "serviceWorker", { value: new EventTarget(), configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forget(); Reflect.deleteProperty(navigator, "serviceWorker"); });

it("offers Nyalakan notifikasi in the top bar beside Aplikasi saya, and says it is on afterwards", async () => {
  const port = samplePush("off");
  open(port);
  const button = await topbar().findByRole("button", { name: "Nyalakan notifikasi" });
  expect(button.nextElementSibling).toBe(topbar().getByRole("link", { name: "Aplikasi saya" }));
  fireEvent.click(button);
  expect(await screen.findByText("Notifikasi aktif di tablet ini")).toBeTruthy();
  expect(port.calls).toEqual(["info", "ask", "subscribe", "save"]);
  expect(topbar().getByText("Notifikasi aktif")).toBeTruthy();
  expect(topbar().queryByRole("button", { name: "Nyalakan notifikasi" })).toBeNull();
});

it("explains, in a message that stays, why it cannot be turned on", async () => {
  const blocked = samplePush("denied");
  open(blocked);
  fireEvent.click(await topbar().findByRole("button", { name: "Nyalakan notifikasi" }));
  expect((await screen.findByText("Notifikasi belum bisa dinyalakan")).closest("[role]")?.textContent).toMatch(/diblokir untuk situs ini.*Tablet tetap jalan/);
  expect(blocked.calls).toEqual(["info"]);
  cleanup();
  const refused = samplePush("off", { answer: "denied" });
  open(refused);
  fireEvent.click(await topbar().findByRole("button", { name: "Nyalakan notifikasi" }));
  expect(await screen.findByText("Notifikasi belum menyala")).toBeTruthy();
  expect(document.body.textContent).toMatch(/Izin notifikasi belum diberikan/);
});

it("draws nothing about notifications while the server is not ready, or without a port", async () => {
  open(samplePush("not-ready"));
  await flush();
  expect(topbar().queryByRole("button", { name: /notifikasi/i })).toBeNull();
  expect(topbar().queryByText(/Notifikasi/)).toBeNull();
  cleanup();
  open(null);
  await flush();
  expect(topbar().queryByText(/otifikasi/)).toBeNull();
});

it("in guest mode draws, asks, registers and hears nothing of web push", async () => {
  const port = samplePush("off");
  const { api } = open(port, { held: true });
  await flush();
  const page = document.querySelector("[data-guest]")!;
  expect(page).toBeTruthy();
  expect(page.textContent).not.toMatch(/otifikasi|kotak pratinjau/);
  expect(screen.queryByRole("banner")).toBeNull();
  expect(port.calls).toEqual([]);
  // A push arrives and its notification is tapped: the book stays, and nothing is read.
  news({ type: "coffee:push" });
  news({ type: "coffee:open", url: coffeePath.gaOrder("o1") });
  await flush();
  expect(api.state).not.toHaveBeenCalled();
  expect(document.querySelector("[data-guest]")).toBeTruthy();
});

it("stops listening the moment the tablet is handed to a guest", async () => {
  const port = samplePush("on");
  const { api } = open(port);
  await flush();
  press("Pesanan baru");
  fireEvent.click(screen.getByRole("button", { name: "Pilih Vasuki Room" }));
  fireEvent.click(screen.getByText(SAMPLE_PEOPLE[0].name).closest("button")!);
  press("Serahkan ke tamu");
  expect(document.querySelector("[data-guest]")).toBeTruthy();
  const reads = api.state.mock.calls.length;
  news({ type: "coffee:open", url: coffeePath.gaOrder("o1") });
  await flush();
  expect(api.state.mock.calls.length).toBe(reads);
  expect(document.querySelector("[data-guest]")?.textContent).not.toMatch(/otifikasi/);
});

it("opens the status of the order the address names, tidies the address, and ignores one it does not know", async () => {
  const server = createSampleGa({ seeded: true });
  const done = server.initial().today.find(order => order.status === "selesai")!;
  window.history.replaceState(null, "", `${window.location.pathname}?${COFFEE_GA_ORDER}=${done.id}`);
  render(<GaApp initial={server.initial()} me={{ name: SAMPLE_GA }} api={server.api} push={null} openId={done.id} />);
  rest();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/siap diambil|Selesai/i);
  expect(screen.getByText(new RegExp(`#${done.no}`))).toBeTruthy();
  expect(window.location.search).toBe("");
  cleanup(); forget();
  render(<GaApp initial={server.initial()} me={{ name: SAMPLE_GA }} api={server.api} push={null} openId="tidak-ada" />);
  rest();
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeTruthy();
  cleanup(); forget();
  // A page loaded in guest mode never opens it: the book stays.
  render(<GaApp held initial={{ today: [], people: [], rooms: [], pin: false }} me={{ name: SAMPLE_GA }} api={server.api} push={null} openId={done.id} />);
  rest();
  expect(document.querySelector("[data-guest]")).toBeTruthy();
});

it("reads at once on a push, and a tapped notification opens that order unless one is being written", async () => {
  const port = samplePush("on");
  const { server, api, initial } = open(port);
  await flush();
  const waiting = initial.today.find(order => order.status === "diproses")!;
  server.settle("selesai");
  news({ type: "coffee:push" });
  await waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeTruthy();
  news({ type: "coffee:open", url: coffeePath.gaOrder(waiting.id) });
  await waitFor(() => expect(screen.getAllByText(new RegExp(`#${waiting.no}`)).length).toBeGreaterThan(0));
  await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeNull());
  // Back on Beranda, writing a new order: the tap does not take the screen away.
  rest();
  press("Ke beranda");
  press("Pesanan baru");
  news({ type: "coffee:open", url: coffeePath.gaOrder(waiting.id) });
  await flush(); await flush();
  expect(screen.getByRole("button", { name: "Pilih Vasuki Room" })).toBeTruthy();
});
