import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CoffeePushState } from "@/lib/coffee/notify";
import { coffeePath } from "@/lib/routes";
import { CoffeeApp } from "./CoffeeApp";
import { stayOnPage } from "./Layer";
import { PushBox } from "./NotifySetup";
import { samplePush, sampleState } from "./pushSample";
import { createSampleCoffee } from "./sample";
import { SetupSteps } from "./SetupSteps";
import { dropPush, usePush, useWorkerNews, type PushPort, type WorkerNews } from "./usePush";

/*
 * Web push in the employee app (F4) on a make-believe device (pushSample.ts): the states of
 * "Izinkan notifikasi" and of the Akun sheet's "Notifikasi", that a device follows whoever is
 * signed in and is let go of at Keluar, and what the service worker's messages do. No real service
 * worker, permission or push service is involved; those are for a real device.
 */
function Probe({ port, paused = false }: { port: PushPort | null; paused?: boolean }) {
  const push = usePush(port, paused);
  return <PushBox push={push} />;
}
const box = () => screen.getByRole("region", { name: "Notifikasi" });
const news = (data: unknown) => act(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(navigator, "serviceWorker", { value: new EventTarget(), configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); stayOnPage(); Reflect.deleteProperty(navigator, "serviceWorker"); });

it("turns notifications on: asks the browser, subscribes, saves the device, and then offers a test and Matikan", async () => {
  const port = samplePush("off");
  render(<Probe port={port} />);
  expect(await screen.findByText("Belum aktif")).toBeTruthy();
  expect(within(box()).getByRole("status").textContent).toMatch(/^Nyalakan supaya kamu diberi tahu begitu pengajuanmu selesai diproses/);
  fireEvent.click(screen.getByRole("button", { name: "Nyalakan notifikasi" }));
  expect(await screen.findByText("Aktif")).toBeTruthy();
  expect(port.calls).toEqual(["info", "ask", "subscribe", "save"]);
  fireEvent.click(screen.getByRole("button", { name: "Kirim notifikasi tes" }));
  await waitFor(() => expect(within(box()).getByRole("status").textContent).toBe("Notifikasi tes dikirim. Notifikasinya muncul dalam beberapa detik."));
  fireEvent.click(screen.getByRole("button", { name: "Matikan" }));
  expect(await screen.findByText("Belum aktif")).toBeTruthy();
  expect(port.calls.slice(-3)).toEqual(["test", "remove:https://push.example/contoh", "unsubscribe"]);
});

it("a device that is already subscribed is saved again for whoever is signed in now", async () => {
  const port = samplePush("on");
  render(<Probe port={port} />);
  expect(await screen.findByText("Aktif")).toBeTruthy();
  expect(port.calls).toEqual(["info", "save"]);
  expect(screen.queryByRole("button", { name: "Nyalakan notifikasi" })).toBeNull();
});

it("says what is in the way, and how to get past it, where it cannot be turned on", async () => {
  const cases: [CoffeePushState, string, RegExp][] = [
    ["denied", "Diblokir", /diblokir untuk situs ini.*pengaturan situs.*Izinkan.*muat ulang/],
    ["ios-install", "Pasang dulu", /dipasang dulu ke layar utama/],
    ["unsupported", "Tidak didukung", /belum mendukung notifikasi/],
    ["not-ready", "Belum tersedia", /^Notifikasi belum tersedia\. Aplikasi tetap jalan/],
  ];
  for (const [state, label, note] of cases) {
    const port = samplePush(state);
    render(<Probe port={port} />);
    expect(await screen.findByText(label), state).toBeTruthy();
    expect(within(box()).getByRole("status").textContent, state).toMatch(note);
    expect(within(box()).queryByRole("button"), state).toBeNull();
    // A device that cannot take notifications is never asked for permission, and nothing is saved.
    expect(port.calls.filter(call => call !== "info"), state).toEqual([]);
    cleanup();
  }
  expect(sampleState("denied")).toBe("denied");
  expect(sampleState("apa saja")).toBe("off");
});

it("stays off when the browser's question is answered with no, and says so when the server cannot save the device", async () => {
  const refused = samplePush("off", { answer: "denied" });
  render(<Probe port={refused} />);
  fireEvent.click(await screen.findByRole("button", { name: "Nyalakan notifikasi" }));
  expect(await screen.findByText("Diblokir")).toBeTruthy();
  expect(refused.calls).toEqual(["info", "ask"]);
  cleanup();
  const broken = samplePush("off", { fail: true });
  render(<Probe port={broken} />);
  fireEvent.click(await screen.findByRole("button", { name: "Nyalakan notifikasi" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Notifikasi menunggu migrasi 202612010002_coffee_push.sql.");
  expect(screen.getByText("Belum aktif")).toBeTruthy();
});

it("asks and registers nothing while paused, or without a port", async () => {
  const port = samplePush("off");
  const { container } = render(<Probe port={port} paused />);
  await flush();
  expect(port.calls).toEqual([]);
  expect(container.textContent).toBe("");
  cleanup();
  const none = render(<Probe port={null} />);
  await flush();
  expect(none.container.textContent).toBe("");
});

it("lets go of the device at sign-out without ever throwing or waiting for long", async () => {
  const port = samplePush("on");
  await dropPush(port);
  expect(port.calls).toEqual(["remove:https://push.example/contoh", "unsubscribe"]);
  expect(port.saved()).toBe(false);
  // Nothing to remove, no push here, a server that does not answer: all the same to the caller.
  await expect(dropPush(samplePush("off"))).resolves.toBeUndefined();
  await expect(dropPush(samplePush("unsupported"))).resolves.toBeUndefined();
  await expect(dropPush(null)).resolves.toBeUndefined();
  const failing = samplePush("on");
  failing.api.remove = async () => { throw new Error("offline"); };
  await expect(dropPush(failing)).resolves.toBeUndefined();
  // The browser still lets go of it, so the address is dead and the next sending removes the row (410).
  expect(failing.saved()).toBe(false);
  vi.useFakeTimers();
  const hanging = samplePush("on");
  hanging.api.remove = () => new Promise(() => undefined);
  const done = dropPush(hanging);
  await vi.advanceTimersByTimeAsync(6_000);
  await expect(done).resolves.toBeUndefined();
  vi.useRealTimers();
});

it("hears only the service worker's own two messages, and only addresses of this site", () => {
  const heard: WorkerNews[] = [];
  function Listener({ on }: { on: boolean }) { useWorkerNews(item => heard.push(item), on); return null; }
  const { rerender } = render(<Listener on />);
  news({ type: "coffee:push" });
  news({ type: "coffee:open", url: coffeePath.orders });
  for (const data of [null, "coffee:push", { type: "lain" }, { type: "coffee:open" }, { type: "coffee:open", url: "https://evil.example/coffee" }, { type: "coffee:open", url: "//evil.example" }]) news(data);
  expect(heard).toEqual([{ type: "push" }, { type: "open", url: coffeePath.orders }]);
  rerender(<Listener on={false} />);
  news({ type: "coffee:push" });
  expect(heard).toHaveLength(2);
});

it("Atur sekali offers Izinkan notifikasi, and explains instead of offering when it cannot be turned on", async () => {
  const allow = vi.fn(async () => "granted" as const);
  const onDone = vi.fn();
  const { rerender } = render(<SetupSteps phone="android" installed notify={{ allow, state: "off" }} onDone={onDone} />);
  expect(screen.getByRole("heading", { level: 1, name: "Izinkan notifikasi" })).toBeTruthy();
  expect(screen.getByText("Atur sekali · 1 dari 1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Izinkan notifikasi" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(allow).toHaveBeenCalledTimes(1);

  const states: [CoffeePushState, RegExp][] = [
    ["ios-install", /dipasang dulu ke layar utama.*dibuka dari ikonnya.*Aplikasi tetap jalan/],
    ["denied", /diblokir.*Izinkan.*muat ulang.*Aplikasi tetap jalan/],
    ["unsupported", /belum mendukung notifikasi.*Aplikasi tetap jalan/],
    ["not-ready", /Notifikasi belum tersedia\. Aplikasi tetap jalan/],
    ["on", /^Notifikasi sudah aktif di perangkat ini\.$/],
  ];
  for (const [state, note] of states) {
    rerender(<SetupSteps phone="android" installed notify={{ allow, state }} onDone={onDone} />);
    expect(screen.getByRole("status").textContent, state).toMatch(note);
    expect(screen.queryByRole("button", { name: "Izinkan notifikasi" }), state).toBeNull();
    expect(screen.getByRole("button", { name: "Mulai pesan" }), state).toBeTruthy();
  }
  // The preview on the lock screen says what the real notification says, never "HR".
  expect(document.body.textContent).toMatch(/Café Latte kamu selesai diproses oleh Dewi\./);
  expect(document.body.textContent).not.toMatch(/\bHR\b|membelikan/);
});

function openApp(port: ReturnType<typeof samplePush>, used = 1) {
  const server = createSampleCoffee({ used });
  const order: string[] = [];
  const api = { ...server.api, state: vi.fn(server.api.state), signOut: vi.fn(async () => { order.push(`signOut after ${port.calls.at(-1)}`); }) };
  render(<CoffeeApp initial={server.initial()} api={api} routing="memory" push={port} />);
  return { server, api, order };
}

it("shows Notifikasi in the Akun sheet and removes the device before the session ends at Keluar", async () => {
  const port = samplePush("on");
  const { api, order } = openApp(port);
  fireEvent.click(screen.getByRole("button", { name: "Akun Rina (contoh)" }));
  const sheet = within(screen.getByRole("dialog"));
  expect(await sheet.findByText("Aktif")).toBeTruthy();
  expect(sheet.getByRole("button", { name: "Kirim notifikasi tes" })).toBeTruthy();
  fireEvent.click(sheet.getByRole("button", { name: "Keluar" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Kamu sudah keluar" })).toBeTruthy();
  expect(api.signOut).toHaveBeenCalledTimes(1);
  // First the server forgets the device and the browser lets go of it, then the session ends.
  expect(port.calls.slice(-2)).toEqual(["remove:https://push.example/contoh", "unsubscribe"]);
  expect(order).toEqual(["signOut after unsubscribe"]);
});

it("reads at once when the service worker pushed, and opens Pesanan saya when the notification was tapped", async () => {
  const port = samplePush("on");
  const { server, api } = openApp(port, 0);
  await flush();
  expect(api.state).not.toHaveBeenCalled();
  server.recordManual();
  news({ type: "coffee:push" });
  await waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("heading", { level: 1, name: /Halo/ })).toBeTruthy();
  news({ type: "coffee:open", url: coffeePath.orders });
  await waitFor(() => expect(api.state).toHaveBeenCalledTimes(2));
  expect(within(screen.getByRole("navigation", { name: "Navigasi" })).getByRole("link", { name: /Pesanan saya/ }).getAttribute("aria-current")).toBe("page");
});

it("leaves notifications out entirely where no port is given (the other tests of the app)", async () => {
  const server = createSampleCoffee({});
  render(<CoffeeApp initial={server.initial()} api={{ ...server.api }} routing="memory" />);
  fireEvent.click(screen.getByRole("button", { name: "Akun Rina (contoh)" }));
  await flush();
  expect(within(screen.getByRole("dialog")).queryByText("Notifikasi")).toBeNull();
});
