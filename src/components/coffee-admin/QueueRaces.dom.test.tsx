import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminApiError } from "@/components/admin/shared/api";
import type { Done } from "./api";
import { CoffeeAdminApp } from "./CoffeeAdminApp";
import { SAMPLE_ACTOR, createSampleServer, type SampleServer } from "./sample";
import { coffeeAdminSections } from "./sections";
import { CLICK_GUARD_MS, POLL_MS } from "./useQueue";

/*
 * Antrean when things happen at once (audit F1, 25 Nov 2026): a double click, a read that falls in
 * the middle of Selesai, two Urungkan in a row, reads that overlap. The make-believe server answers
 * when the test lets it. Made-up people only.
 */
vi.mock("next/navigation", () => ({ usePathname: () => null }));
const NOW = "2026-11-25T03:00:00.000Z";

/** An answer the test lets through when it chooses. */
function held<T>(work: () => Promise<T>) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  return { run: async () => { await gate; return work(); }, release };
}
async function open(change: (server: SampleServer) => Partial<SampleServer["api"]> = () => ({})) {
  const server = createSampleServer();
  const initial = { queue: await server.api.queue() };
  const api = { ...server.api, ...change(server) };
  render(<CoffeeAdminApp view="antrean" initial={initial} now={NOW} personName={SAMPLE_ACTOR.name} api={api} routing="memory" />);
  return { server, api };
}
const titles = () => within(screen.getByRole("region", { name: "Pesanan menunggu" })).queryAllByRole("article").map(item => within(item).getByRole("heading").textContent);
const card = (title: RegExp) => within(screen.getByRole("region", { name: "Pesanan menunggu" })).getAllByRole("article").find(item => title.test(item.textContent ?? ""))!;
const press = (title: RegExp, name: RegExp) => fireEvent.click(within(card(title)).getByRole("button", { name }));
const tally = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
const recent = () => screen.getByRole("heading", { name: "Baru diproses" }).parentElement!;
const visible = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); visible("visible"); vi.useRealTimers(); vi.unstubAllGlobals(); });

// F1-01: the card leaves at once and the next one moves up under the pointer.
it("a double click on Selesai finishes one order: the press that lands on the card that moved up is ignored", async () => {
  const finish = vi.fn();
  const { server } = await open(made => ({ finish: finish.mockImplementation(made.api.finish) }));
  // Two claims in a row: finish the meeting between them first, and let the guard pass.
  press(/Kaliya Limasan/, /Selesai diproses/);
  await waitFor(() => expect(finish).toHaveBeenCalledTimes(1));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, CLICK_GUARD_MS + 50)); });
  expect(titles()).toEqual(["Café Latte", "Matcha Latte"]);

  press(/Café Latte/, /Selesai diproses/);
  expect(titles()).toEqual(["Matcha Latte"]);
  press(/Matcha Latte/, /Selesai diproses/); // the second click of the double click
  await settle();
  expect(finish).toHaveBeenCalledTimes(2);
  expect(titles()).toEqual(["Matcha Latte"]);
  expect(server.orders.filter(order => order.status === "diproses").map(order => order.items[0].slug)).toEqual(["matcha-latte"]);
  expect(screen.queryByRole("alert")).toBeNull();
  // The message is about the order that was finished, and a moment later the next card answers again.
  expect(screen.getByText("Selesai diproses", { selector: "strong" }).parentElement!.textContent).toMatch(/Rina · Café Latte/);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, CLICK_GUARD_MS + 50)); });
  press(/Matcha Latte/, /Selesai diproses/);
  await waitFor(() => expect(finish).toHaveBeenCalledTimes(3));
  expect(titles()).toEqual([]);
});

// F1-02 (a): the read comes back, while Selesai is still being sent, with the state from before it was saved.
it("a read that falls in the middle of Selesai never brings the card back", async () => {
  let gate!: ReturnType<typeof held<Done>>;
  const queue = vi.fn();
  const { server } = await open(made => ({
    finish: id => { gate = held(() => made.api.finish(id)); return gate.run(); },
    queue: queue.mockImplementation(made.api.queue),
  }));
  press(/Café Latte/, /Selesai diproses/);
  expect(titles()).toEqual(["Kaliya Limasan · 6 minuman", "Matcha Latte"]);
  visible("visible"); // the tab comes back: the queue is read, and the server still has the order waiting
  await settle();
  expect(queue).toHaveBeenCalledTimes(1);
  expect(titles()).toEqual(["Kaliya Limasan · 6 minuman", "Matcha Latte"]);
  expect(tally("Diproses")).toBe("2");
  gate.release();
  await waitFor(() => expect(screen.getByText("Selesai diproses", { selector: "strong" })).toBeTruthy());
  await settle();
  // In one place only, counted once, and read once more now that the action is answered.
  expect(titles()).toEqual(["Kaliya Limasan · 6 minuman", "Matcha Latte"]);
  expect(within(recent()).getAllByText("Rina · Café Latte", { selector: "strong" })).toHaveLength(1);
  expect([tally("Diproses"), tally("Selesai")]).toEqual(["2", "3"]);
  expect(queue).toHaveBeenCalledTimes(2);
  expect(server.orders.filter(order => order.status === "diproses")).toHaveLength(2);
});

// F1-02 (b): the server has already saved it when the read arrives; the answer of Selesai comes after.
it("a read that already holds the finished order does not count it twice", async () => {
  let answer!: Done;
  let release!: () => void;
  const { server } = await open(made => ({
    async finish(id) { answer = await made.api.finish(id); await new Promise<void>(resolve => { release = resolve; }); return answer; },
  }));
  press(/Café Latte/, /Selesai diproses/);
  await settle();
  visible("visible");
  await settle();
  expect(tally("Selesai")).toBe("2"); // the read is not applied while the action is being sent
  release();
  await waitFor(() => expect(screen.getByText("Selesai diproses", { selector: "strong" })).toBeTruthy());
  await settle();
  expect([tally("Diproses"), tally("Selesai"), tally("Ditolak")]).toEqual(["2", "3", "1"]);
  expect(within(recent()).getAllByText("Rina · Café Latte", { selector: "strong" })).toHaveLength(1);
  expect(server.orders.filter(order => order.status === "selesai" && order.id === answer.order.id)).toHaveLength(1);
});

// F1-04: each Urungkan has its own lock.
it("two Urungkan in a row: the first stays disabled until it is answered, and each order is asked once", async () => {
  const gates: Record<string, ReturnType<typeof held<Done>>> = {};
  const reopen = vi.fn();
  await open(made => ({
    reopen: reopen.mockImplementation((id: string) => { gates[id] = held(() => made.api.reopen(id)); return gates[id].run(); }),
  }));
  press(/Café Latte/, /Selesai diproses/);
  await waitFor(() => expect(recent().textContent).toMatch(/Rina · Café Latte/));
  const row = (name: RegExp) => within(recent()).getAllByRole("listitem").find(item => name.test(item.textContent ?? ""))!;
  const undo = (name: RegExp) => within(row(name)).getByRole("button", { name: /Urungkan|Mengurungkan/ }) as HTMLButtonElement;
  fireEvent.click(undo(/Rina · Café Latte/));
  fireEvent.click(undo(/Maya · Cappuccino/));
  expect(undo(/Rina · Café Latte/).disabled).toBe(true);
  expect(undo(/Maya · Cappuccino/).disabled).toBe(true);
  fireEvent.click(undo(/Rina · Café Latte/)); // a disabled button, and the hook refuses a second sending too
  expect(reopen.mock.calls.map(call => call[0])).toHaveLength(2);
  expect(new Set(reopen.mock.calls.map(call => call[0])).size).toBe(2);
  Object.values(gates).forEach(gate => gate.release());
  await waitFor(() => expect(titles()).toEqual(["Café Latte", "Kaliya Limasan · 6 minuman", "Matcha Latte", "Cappuccino"].sort((a, b) => titles().indexOf(a) - titles().indexOf(b))));
  expect(titles()).toHaveLength(4);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("says why when the server refuses Urungkan, and reads the queue again", async () => {
  const queue = vi.fn();
  await open(made => ({
    queue: queue.mockImplementation(made.api.queue),
    reopen: async () => { throw new AdminApiError("Sudah lewat batas waktu untuk mengurungkan.", undefined, 409); },
  }));
  fireEvent.click(within(recent()).getByRole("button", { name: /Urungkan/ }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Sudah lewat batas waktu untuk mengurungkan\./));
  await waitFor(() => expect(queue).toHaveBeenCalledTimes(1));
  expect(titles()).toHaveLength(3);
});

it("puts the card back when Tolak could not reach the server", async () => {
  await open(() => ({ reject: async () => { throw new TypeError("Failed to fetch"); } }));
  press(/Matcha Latte/, /Tolak/);
  fireEvent.click(screen.getByRole("button", { name: "Minuman sedang habis di mesin." }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tolak" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(titles()).toEqual(["Café Latte", "Kaliya Limasan · 6 minuman", "Matcha Latte"]);
  expect([tally("Diproses"), tally("Ditolak")]).toEqual(["3", "1"]);
});

// F1-09: the keyboard does not start again from the top of the page.
it("moves the focus to the queue when the card that held it leaves", async () => {
  await open();
  const button = within(card(/Café Latte/)).getByRole("button", { name: /Selesai diproses/ });
  button.focus();
  fireEvent.click(button);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(document.activeElement).toBe(screen.getByRole("region", { name: "Pesanan menunggu" }));
});

// F1-15 and the audit's missing test 4.
it("reads every ten seconds while visible, not while hidden, never two at once, and stops when it is taken away", async () => {
  let gate = held(async () => undefined);
  const queue = vi.fn();
  const { server } = await open(made => ({ queue: queue.mockImplementation(async () => { const current = gate; await current.run(); return made.api.queue(); }) }));
  expect(queue).not.toHaveBeenCalled(); // the page brought the first state
  await act(async () => { vi.advanceTimersByTime(POLL_MS); });
  expect(queue).toHaveBeenCalledTimes(1);
  // The first read still runs: the next ticks do not start another.
  await act(async () => { vi.advanceTimersByTime(POLL_MS * 2); });
  expect(queue).toHaveBeenCalledTimes(1);
  server.addClaim();
  gate.release();
  await waitFor(() => expect(titles()).toHaveLength(4));
  expect(screen.getByText("Pesanan baru masuk")).toBeTruthy();
  gate = held(async () => undefined); gate.release();
  visible("hidden");
  await act(async () => { vi.advanceTimersByTime(POLL_MS * 3); });
  expect(queue).toHaveBeenCalledTimes(1);
  visible("visible");
  await settle();
  expect(queue).toHaveBeenCalledTimes(2);
  cleanup();
  await act(async () => { vi.advanceTimersByTime(POLL_MS * 3); });
  expect(queue).toHaveBeenCalledTimes(2);
});

it("lets the newest read win when an older one answers late", async () => {
  const gates: ReturnType<typeof held<undefined>>[] = [];
  const { server } = await open(made => ({
    async queue() { const state = await made.api.queue(); const gate = held(async () => undefined); gates.push(gate); await gate.run(); return state; },
  }));
  visible("visible"); // read 1: three wait
  await settle();
  server.addClaim();
  visible("visible"); // read 2: four wait
  await settle();
  gates[1].release();
  await waitFor(() => expect(titles()).toHaveLength(4));
  gates[0].release(); // the older answer arrives last
  await settle();
  expect(titles()).toHaveLength(4);
  expect(screen.getAllByText("Pesanan baru masuk")).toHaveLength(1);
});

// F1-12: news that only informs never takes away the message that still offers Urungkan.
it("keeps the message with Urungkan when a new order comes in", async () => {
  const { server } = await open();
  press(/Café Latte/, /Selesai diproses/);
  await waitFor(() => expect(screen.getByText("Selesai diproses", { selector: "strong" })).toBeTruthy());
  server.addClaim();
  visible("visible");
  await waitFor(() => expect(titles()).toHaveLength(3));
  expect(screen.queryByText("Pesanan baru masuk")).toBeNull();
  expect(screen.getByText("Selesai diproses", { selector: "strong" }).closest("[role=status]")!.querySelector("button")!.textContent).toBe("Urungkan");
});

// F1-14: the quotas are read again each time Pengaturan or Catat manual is opened.
it("reads Pengaturan again each time it is opened, keeping what it knew on screen", async () => {
  const settings = vi.fn();
  const { server } = await open(made => ({ settings: settings.mockImplementation(made.api.settings) }));
  const go = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "Menu pengelola (ponsel)" })).getByRole("link", { name: new RegExp(name) }));
  go("Pengaturan");
  await waitFor(() => expect((screen.getByLabelText("Karyawan") as HTMLInputElement).value).toBe("4"));
  expect(settings).toHaveBeenCalledTimes(1);
  go("Antrean");
  await server.api.saveSettings({ karyawan: 6, ga: 2, intern: 2 }); // another pengelola, elsewhere
  go("Pengaturan");
  expect((screen.getByLabelText("Karyawan") as HTMLInputElement).value).toBe("4"); // shown at once from what was known
  await waitFor(() => expect((screen.getByLabelText("Karyawan") as HTMLInputElement).value).toBe("6"));
  expect(settings).toHaveBeenCalledTimes(2);
});

// 26 Nov 2026: the phone's bottom menu is the desktop menu; Catat manual is a button of Antrean, not a tab.
it("gives the phone's bottom menu the three sections of the desktop menu, and opens Catat manual from Antrean's head", async () => {
  await open();
  const bar = screen.getByRole("navigation", { name: "Menu pengelola (ponsel)" });
  expect(within(bar).getAllByRole("link").map(link => link.textContent!.replace(/^\d+ pesanan menunggu/, ""))).toEqual(coffeeAdminSections.map(section => section.label));
  expect(within(bar).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(coffeeAdminSections.map(section => section.href));
  expect(within(bar).queryAllByRole("button")).toHaveLength(0);
  expect(within(bar).getByRole("link", { name: /Antrean/ }).textContent).toMatch(/\d+ pesanan menunggu/);
  const manual = screen.getAllByRole("button", { name: "Catat manual" });
  expect(manual).toHaveLength(1);
  expect(manual[0].className).not.toMatch(/desktopOnly/);
  fireEvent.click(manual[0]);
  expect(await screen.findByRole("dialog", { name: "Catat manual" })).toBeTruthy();
});
