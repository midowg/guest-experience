import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { samplePush } from "@/components/coffee/pushSample";
import type { CoffeePushState } from "@/lib/coffee/notify";
import { coffeeAdminPath } from "@/lib/routes";
import { CoffeeAdminApp } from "./CoffeeAdminApp";
import { SAMPLE_ACTOR, createSampleServer } from "./sample";

/*
 * "Nyalakan notifikasi" for the pengelola (F4) on a make-believe device: the states above the
 * queue, the notice a super admin and a server without keys get, that Keluar lets go of the device
 * first, and that a pushed order reads the queue at once. No real service worker is involved.
 */
vi.mock("next/navigation", () => ({ usePathname: () => null }));
const NOW = "2026-11-25T03:00:00.000Z";
type Port = ReturnType<typeof samplePush>;

async function open(port: Port | null, view: "antrean" | "rekap" = "antrean") {
  const server = createSampleServer();
  const initial = { queue: await server.api.queue() };
  const api = { ...server.api, queue: vi.fn(server.api.queue) };
  render(<CoffeeAdminApp view={view} initial={initial} now={NOW} personName={SAMPLE_ACTOR.name} api={api} push={port} routing="memory" />);
  return { server, api };
}
const news = (data: unknown) => act(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(navigator, "serviceWorker", { value: new EventTarget(), configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "serviceWorker"); });

it("offers Nyalakan notifikasi above the queue, and Matikan once it is on", async () => {
  const port = samplePush("off");
  await open(port);
  expect(await screen.findByText(/^Nyalakan supaya kamu diberi tahu begitu ada klaim atau pesanan rapat baru/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Nyalakan notifikasi" }));
  expect(await screen.findByText("Notifikasi pesanan baru aktif di perangkat ini.")).toBeTruthy();
  expect(port.calls).toEqual(["info", "ask", "subscribe", "save"]);
  fireEvent.click(screen.getByRole("button", { name: "Matikan" }));
  expect(await screen.findByRole("button", { name: "Nyalakan notifikasi" })).toBeTruthy();
  expect(port.calls.slice(-2)).toEqual(["remove:https://push.example/contoh", "unsubscribe"]);
});

it("says why it cannot be turned on: the super admin's sign-in, missing keys, a blocked or unfit browser", async () => {
  const cases: [CoffeePushState, RegExp][] = [
    ["account", /^Masuk dengan akun karyawan untuk menerima notifikasi\./],
    ["not-ready", /kunci WAM_VAPID_PUBLIC_KEY dan WAM_VAPID_PRIVATE_KEY belum diisi di server\. Antrean tetap diperbarui sendiri/],
    ["denied", /diblokir untuk situs ini.*Izinkan.*muat ulang/],
    ["unsupported", /belum mendukung notifikasi/],
  ];
  for (const [state, note] of cases) {
    const port = samplePush(state);
    await open(port);
    expect(await screen.findByText(note), state).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nyalakan notifikasi" }), state).toBeNull();
    // The queue is there all the same, and the note can be put away.
    expect(screen.getByRole("region", { name: "Pesanan menunggu" }), state).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutup keterangan notifikasi" }));
    expect(screen.queryByText(note), state).toBeNull();
    expect(port.calls.filter(call => call !== "info"), state).toEqual([]);
    cleanup();
  }
});

it("draws nothing about notifications without a port, and never fails the screen", async () => {
  await open(null);
  await flush();
  expect(screen.queryByText(/otifikasi/)).toBeNull();
  expect(screen.getByRole("region", { name: "Pesanan menunggu" })).toBeTruthy();
});

it("lets go of the device before Keluar does its work", async () => {
  const port = samplePush("on");
  await open(port);
  await screen.findByText("Notifikasi pesanan baru aktif di perangkat ini.");
  const fetched = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetched);
  const order: string[] = [];
  fetched.mockImplementation(async () => { order.push(`logout after ${port.calls.at(-1)}`); return new Response(JSON.stringify({ ok: false }), { status: 500 }); });
  fireEvent.click(screen.getAllByRole("button", { name: "Keluar" })[0]);
  await waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));
  expect(order).toEqual(["logout after unsubscribe"]);
  expect(port.calls.slice(-2)).toEqual(["remove:https://push.example/contoh", "unsubscribe"]);
  // A second press (the first logout failed) goes straight through: there is nothing left to let go of.
  fireEvent.click(screen.getAllByRole("button", { name: "Keluar" })[0]);
  await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2));
});

it("leaves Keluar alone when this device has no notifications on", async () => {
  const port = samplePush("off");
  await open(port);
  await screen.findByRole("button", { name: "Nyalakan notifikasi" });
  const fetched = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 }));
  vi.stubGlobal("fetch", fetched);
  fireEvent.click(screen.getAllByRole("button", { name: "Keluar" })[0]);
  expect(fetched).toHaveBeenCalledTimes(1);
  expect(port.calls).toEqual(["info"]);
});

it("reads the queue at once when an order was pushed, and a tapped notification shows Antrean", async () => {
  const port = samplePush("on");
  const { server, api } = await open(port, "rekap");
  await flush();
  const before = api.queue.mock.calls.length;
  server.addClaim();
  news({ type: "coffee:push" });
  await waitFor(() => expect(api.queue.mock.calls.length).toBe(before + 1));
  // Rekap stays on screen for a push; the tap is what moves to the queue.
  expect(screen.queryByRole("region", { name: "Pesanan menunggu" })).toBeNull();
  news({ type: "coffee:open", url: coffeeAdminPath.home });
  expect(await screen.findByRole("region", { name: "Pesanan menunggu" })).toBeTruthy();
});
