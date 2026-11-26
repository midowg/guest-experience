import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { coffeePath } from "@/lib/routes";
import { CoffeeApiError } from "../api";
import { stayOnPage } from "../Layer";
import { samplePush } from "../pushSample";
import { GaApp } from "./GaApp";
import { SAMPLE_GA, SAMPLE_PEOPLE, createSampleGa } from "./sample";
import { forget, NOW, rest } from "./testing";

/*
 * Keluar on GA's tablet (26 Nov 2026), on the make-believe server: in the top bar after "Aplikasi
 * saya", a question first (with a warning when drinks were not sent), this device's notifications
 * let go of, and nothing of the person or of today's orders left on screen. Not in the guest's book.
 */
type Port = ReturnType<typeof samplePush>;
function open(more: { port?: Port | null; held?: boolean } = {}) {
  const server = createSampleGa({ seeded: true, pin: "1234" });
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send), checkPin: vi.fn(server.api.checkPin), signOut: vi.fn(server.api.signOut) };
  render(<GaApp initial={more.held ? server.held() : server.initial()} me={{ name: SAMPLE_GA }} api={api} push={more.port ?? null} held={more.held} />);
  rest();
  return { server, api };
}
const press = (name: string | RegExp) => { fireEvent.click(screen.getByRole("button", { name })); rest(); };
const topbar = () => within(screen.getByRole("banner"));
const dialog = () => within(screen.getByRole("alertdialog"));
/** Beranda → Pesanan baru → room and PIC → Input cepat → one drink that is not sent. */
function unsent() {
  press("Pesanan baru");
  fireEvent.click(screen.getByRole("button", { name: "Pilih Vasuki Room" }));
  fireEvent.click(screen.getByText(SAMPLE_PEOPLE[0].name).closest("button")!);
  press("Input cepat");
  fireEvent.click(screen.getByRole("button", { name: /^Tambah Americano(,|$)/ }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(NOW));
  Object.defineProperty(navigator, "serviceWorker", { value: new EventTarget(), configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forget(); stayOnPage(); Reflect.deleteProperty(navigator, "serviceWorker"); });

it("has Keluar in the top bar after Aplikasi saya, and asks before anything ends", () => {
  const { api } = open();
  const button = topbar().getByRole("button", { name: "Keluar" });
  expect(topbar().getByRole("link", { name: "Aplikasi saya" }).nextElementSibling).toBe(button);
  fireEvent.click(button); rest();
  expect(dialog().getByRole("heading", { name: "Keluar dari tablet ini?" })).toBeTruthy();
  expect(dialog().getByText(new RegExp(`^${SAMPLE_GA.replace(/[()]/g, "\\$&")} keluar dari Mode GA di tablet ini`))).toBeTruthy();
  // Nothing was sent to be thrown away: no warning.
  expect(dialog().queryByText(/belum dikirim/)).toBeNull();
  // The safe answer has the focus, and it ends nothing.
  expect(document.activeElement).toBe(dialog().getByRole("button", { name: "Batal" }));
  fireEvent.click(dialog().getByRole("button", { name: "Batal" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(api.signOut).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeTruthy();
});

it("lets go of this tablet's notifications, ends the session, and leaves nothing of the person on screen", async () => {
  const port = samplePush("on");
  const { api } = open({ port });
  await topbar().findByText("Notifikasi aktif");
  port.calls.length = 0;
  press("Keluar");
  fireEvent.click(dialog().getByRole("button", { name: "Keluar" }));
  await waitFor(() => expect(api.signOut).toHaveBeenCalledTimes(1));
  // The subscription went first, on the server and in the browser (afterwards the server would not listen).
  expect(port.calls.some(call => call.startsWith("remove:"))).toBe(true);
  expect(port.calls).toContain("unsubscribe");
  const page = await waitFor(() => { const found = document.querySelector("[data-left]"); expect(found).toBeTruthy(); return found!; });
  expect(screen.getByRole("heading", { level: 1, name: "Kamu sudah keluar" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Masuk lagi" }).getAttribute("href")).toBe(coffeePath.gaLogin());
  // No name, no room, no PIC, no guest, no order number, no top bar, no dialog.
  expect(page.textContent).not.toMatch(/Bagas|Vasuki|Ananta|contoh|T-01|Notifikasi|Aplikasi saya/);
  expect(document.body.textContent).not.toMatch(/Bagas|Vasuki|Ananta|T-01/);
  expect(screen.queryByRole("banner")).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  // The tablet stops reading: nothing asks the server on behalf of someone who left.
  const reads = api.state.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(api.state.mock.calls.length).toBe(reads);
});

it("warns first when drinks were not sent, and Keluar then drops them without the browser asking again", async () => {
  const { api } = open();
  unsent();
  // With unsent drinks the browser asks before the page is left…
  const leaving = () => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
  expect(leaving()).toBe(true);
  press("Keluar");
  expect(dialog().getByRole("alert").textContent).toBe("1 minuman untuk Vasuki Room belum dikirim ke pengelola. Kalau keluar sekarang, minuman itu dibuang.");
  // Going back keeps the order as it was.
  fireEvent.click(dialog().getByRole("button", { name: "Kembali ke pesanan" }));
  expect(within(screen.getByRole("region", { name: "Pesanan" })).getByText(/Americano/)).toBeTruthy();
  expect(api.signOut).not.toHaveBeenCalled();
  press("Keluar");
  // …but not once the person said yes here: the sign-in page must not be held up (the session is ending).
  api.signOut.mockImplementationOnce(async () => { expect(leaving()).toBe(false); });
  fireEvent.click(dialog().getByRole("button", { name: "Buang dan keluar" }));
  await waitFor(() => expect(document.querySelector("[data-left]")).toBeTruthy());
  expect(api.signOut).toHaveBeenCalledTimes(1);
  expect(api.send).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toMatch(/Americano|Vasuki/);
});

it("stays signed in, and says so, when the server could not be told", async () => {
  const { api } = open();
  api.signOut.mockRejectedValueOnce(new CoffeeApiError("Belum bisa keluar. Periksa jaringan lalu coba lagi."));
  press("Keluar");
  fireEvent.click(dialog().getByRole("button", { name: "Keluar" }));
  expect(await dialog().findByText("Belum bisa keluar. Periksa jaringan lalu coba lagi.")).toBeTruthy();
  expect(document.querySelector("[data-left]")).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeTruthy();
  // A second press tries again and gets out.
  fireEvent.click(dialog().getByRole("button", { name: "Keluar" }));
  await waitFor(() => expect(document.querySelector("[data-left]")).toBeTruthy());
  expect(api.signOut).toHaveBeenCalledTimes(2);
});

it("does not exist in the guest's book: there the only way out is the PIN GA", () => {
  // Loaded while a guest holds the tablet.
  const { api } = open({ held: true });
  const book = document.querySelector("[data-guest]")!;
  expect(book).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Keluar$/ })).toBeNull();
  expect(book.textContent).not.toMatch(/Keluar dari tablet|Aplikasi saya|Masuk lagi/);
  expect(book.querySelector(`a[href="${coffeePath.gaLogin()}"], a[href="${coffeePath.login()}"]`)).toBeNull();
  expect(api.signOut).not.toHaveBeenCalled();
  cleanup(); forget();
  // Handed over from an order.
  open();
  unsent();
  press("Serahkan ke tamu");
  expect(document.querySelector("[data-guest]")).toBeTruthy();
  expect(screen.queryByRole("banner")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Keluar$/ })).toBeNull();
});
