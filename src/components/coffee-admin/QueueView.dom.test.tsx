import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { JUMPSTART_URL } from "@/lib/routes";
import { CoffeeAdminApp } from "./CoffeeAdminApp";
import { SAMPLE_ACTOR, createSampleServer, type SampleServer } from "./sample";

/*
 * Antrean on the make-believe server (25 Nov 2026): Selesai, Tolak with its required note,
 * Urungkan, the order someone else processed first (409), and a new order coming in on the next
 * read. Made-up people only.
 */
vi.mock("next/navigation", () => ({ usePathname: () => null }));
const NOW = "2026-11-25T03:00:00.000Z";

async function open(prepare?: (server: SampleServer) => void) {
  const server = createSampleServer();
  const initial = { queue: await server.api.queue() };
  prepare?.(server);
  const api = { ...server.api, finish: vi.fn(server.api.finish), reject: vi.fn(server.api.reject), reopen: vi.fn(server.api.reopen) };
  render(<CoffeeAdminApp view="antrean" initial={initial} now={NOW} personName={SAMPLE_ACTOR.name} api={api} routing="memory" />);
  return { server, api };
}
const cards = () => within(screen.getByRole("region", { name: "Pesanan menunggu" })).queryAllByRole("article");
const card = (title: RegExp) => cards().find(item => title.test(item.textContent ?? ""))!;
const recent = () => screen.getByRole("heading", { name: "Baru diproses" }).parentElement!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows what waits, oldest first, with the claim's place in the quota and the meeting's lines", async () => {
  await open();
  expect(cards().map(item => within(item).getByRole("heading").textContent)).toEqual(["Café Latte", "Kaliya Limasan · 6 minuman", "Matcha Latte"]);
  expect(card(/Café Latte/).textContent).toMatch(/Rina Putri \(contoh\) · Karyawan/);
  expect(card(/Café Latte/).textContent).toMatch(/Klaim ke-3 dari 4/);
  expect(card(/Café Latte/).textContent).toMatch(/menunggu 14 mnt/);
  expect(card(/Kaliya Limasan/).textContent).toMatch(/PIC Sari Wulandari \(contoh\) · PT Sinar Jaya \(contoh\) · 5 tamu/);
  expect(within(card(/Kaliya Limasan/)).getAllByRole("listitem").map(item => item.textContent)).toEqual([
    expect.stringMatching(/^Tamu3×Kopi Susu · Es/), expect.stringMatching(/^Tamu2×Classic Tea/), expect.stringMatching(/^Tim · rapat1×Americano.*Sari Wulandari/),
  ]);
  const jumpstart = within(card(/Café Latte/)).getByRole("link", { name: /Buka JumpStart/ });
  expect(jumpstart.getAttribute("href")).toBe(JUMPSTART_URL);
  expect(jumpstart.getAttribute("target")).toBe("_blank");
  expect(jumpstart.getAttribute("rel")).toContain("noreferrer");
  // The menu's badge and today's numbers count the same three.
  expect(screen.getAllByText("pesanan menunggu", { exact: false }).length).toBeGreaterThan(0);
  expect(screen.getByText("Diproses", { selector: "dt" }).nextElementSibling?.textContent).toBe("3");
});

it("Selesai diproses: the card leaves at once, the order joins Baru diproses, and Urungkan brings it back", async () => {
  const { api } = await open();
  fireEvent.click(within(card(/Café Latte/)).getByRole("button", { name: /Selesai diproses/ }));
  expect(cards()).toHaveLength(2); // before the server answers
  expect(screen.getByText("Selesai", { selector: "dt" }).nextElementSibling?.textContent).toBe("2");
  await waitFor(() => expect(screen.getByText("Selesai diproses", { selector: "strong" })).toBeTruthy());
  expect(api.finish).toHaveBeenCalledTimes(1);
  expect(recent().textContent).toMatch(/Rina · Café Latte/);
  expect(screen.getByText("Selesai", { selector: "dt" }).nextElementSibling?.textContent).toBe("3");

  fireEvent.click(screen.getByText("Selesai diproses", { selector: "strong" }).closest("[role=status]")!.querySelector("button")!);
  await waitFor(() => expect(screen.getByText("Dikembalikan ke antrean")).toBeTruthy());
  expect(api.reopen).toHaveBeenCalledTimes(1);
  expect(cards().map(item => within(item).getByRole("heading").textContent)).toEqual(["Café Latte", "Kaliya Limasan · 6 minuman", "Matcha Latte"]);
  expect(recent().textContent).not.toMatch(/Rina · Café Latte/);
});

it("Baru diproses offers Urungkan only on what the viewer processed in the last five minutes", async () => {
  await open();
  const rows = within(recent()).getAllByRole("listitem");
  expect(rows[0].textContent).toMatch(/Maya · Cappuccino.*Dewi/);
  expect(within(rows[0]).getByRole("button", { name: /Urungkan/ })).toBeTruthy();
  expect(rows[1].textContent).toMatch(/Ditolak.*Dimas · Espresso.*Raka/);
  expect(within(rows[1]).queryByRole("button")).toBeNull();
});

it("Tolak is held back without a note; a quick reason fills it in and refuses the order", async () => {
  const { api } = await open();
  fireEvent.click(within(card(/Matcha Latte/)).getByRole("button", { name: "Tolak" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toMatch(/Tolak klaim Fajar \(Matcha Latte\)\?/);
  expect(dialog.textContent).toMatch(/Jatah tidak terpakai/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Tolak" }));
  expect(within(dialog).getByRole("alert").textContent).toBe("Tulis catatan untuk pemesan, minimal 3 huruf.");
  expect(api.reject).not.toHaveBeenCalled();
  expect(cards()).toHaveLength(3);

  expect(within(dialog).getByRole("group", { name: "Catatan cepat" }).querySelectorAll("button")).toHaveLength(3);
  fireEvent.click(within(dialog).getByRole("button", { name: "Saldo JumpStart sedang habis." }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Tolak" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(api.reject).toHaveBeenCalledWith(expect.any(String), "Saldo JumpStart sedang habis."));
  await waitFor(() => expect(recent().textContent).toMatch(/Ditolak.*Fajar · Matcha Latte/));
  expect(cards()).toHaveLength(2);
});

it("says so when someone else processed the order first, and keeps the rest of the queue", async () => {
  const { api } = await open(server => { server.processElsewhere(); });
  expect(cards()).toHaveLength(3); // this window has not read the queue again yet
  fireEvent.click(within(card(/Café Latte/)).getByRole("button", { name: /Selesai diproses/ }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/Pesanan ini sudah diproses orang lain\./);
  expect(api.finish).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(recent().textContent).toMatch(/Rina · Café Latte.*Raka/));
  expect(cards().map(item => within(item).getByRole("heading").textContent)).toEqual(["Kaliya Limasan · 6 minuman", "Matcha Latte"]);
});

it("puts a failed Selesai back in the queue when the server could not be reached", async () => {
  const { api } = await open();
  api.finish.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(within(card(/Café Latte/)).getByRole("button", { name: /Selesai diproses/ }));
  await screen.findByRole("alert");
  expect(cards()).toHaveLength(3);
});

it("shows a new order without a reload when the queue is read again", async () => {
  const { server } = await open();
  server.addClaim();
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await waitFor(() => expect(screen.getByText("Pesanan baru masuk")).toBeTruthy());
  expect(cards()).toHaveLength(4);
});

it("Salin rincian copies the order as text for JumpStart, and says so when the browser refuses", async () => {
  const writeText = vi.fn(async (text: string) => { void text; });
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  await open();
  const button = within(card(/Café Latte/)).getByRole("button", { name: /Salin rincian/ });
  fireEvent.click(button);
  await waitFor(() => expect(button.textContent).toBe("Tersalin"));
  expect(writeText).toHaveBeenCalledWith(["Klaim K-418 · Rina (Karyawan)", "1× Café Latte · Panas · gula Normal"].join("\n"));
  writeText.mockRejectedValueOnce(new Error("denied"));
  const other = within(card(/Matcha Latte/)).getByRole("button", { name: /Salin rincian/ });
  fireEvent.click(other);
  await waitFor(() => expect(other.textContent).toBe("Gagal salin"));
});

it("says the queue is empty in the plan's words", async () => {
  const server = createSampleServer();
  const queue = await server.api.queue();
  render(<CoffeeAdminApp view="antrean" initial={{ queue: { ...queue, waiting: [] } }} now={NOW} api={server.api} routing="memory" />);
  expect(screen.getByRole("heading", { name: "Antrean kosong" }).parentElement!.textContent).toMatch(/Pesanan baru muncul di sini tanpa memuat ulang halaman\./);
});

// Audit B-1: a record made by hand that was wrong can be cancelled, after a question.
it("Batalkan catatan: only on a record made by hand, asks first, then the record leaves Baru diproses", async () => {
  let manual = "";
  const cancelManual = vi.fn();
  const server = createSampleServer();
  manual = server.seedManual().id;
  const api = { ...server.api, cancelManual: cancelManual.mockImplementation(server.api.cancelManual) };
  render(<CoffeeAdminApp view="antrean" initial={{ queue: await server.api.queue() }} now={NOW} personName={SAMPLE_ACTOR.name} api={api} routing="memory" />);
  const rows = () => within(recent()).getAllByRole("listitem");
  const row = () => rows().find(item => /Arief · Kopi Susu/.test(item.textContent ?? ""))!;
  expect(row().textContent).toMatch(/Dicatat manual/);
  // Orders made in the app never offer it.
  expect(rows().filter(item => within(item).queryByRole("button", { name: /Batalkan catatan/ }))).toHaveLength(1);
  expect(within(row()).queryByRole("button", { name: /Urungkan/ })).toBeNull();
  expect(screen.getByText("Selesai", { selector: "dt" }).nextElementSibling?.textContent).toBe("3");

  fireEvent.click(within(row()).getByRole("button", { name: /Batalkan catatan/ }));
  const dialog = screen.getByRole("dialog", { name: "Batalkan catatan manual ini?" });
  expect(dialog.textContent).toMatch(/Arief · Kopi Susu · K-\d+/);
  expect(dialog.textContent).toMatch(/Jatah orangnya dikembalikan/);
  expect(cancelManual).not.toHaveBeenCalled();
  // Kembali changes nothing.
  fireEvent.click(within(dialog).getByRole("button", { name: "Kembali" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(cancelManual).not.toHaveBeenCalled();
  expect(row()).toBeTruthy();

  fireEvent.click(within(row()).getByRole("button", { name: /Batalkan catatan/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Batalkan catatan" }));
  await waitFor(() => expect(screen.getByText("Catatan dibatalkan", { selector: "strong" })).toBeTruthy());
  expect(cancelManual).toHaveBeenCalledTimes(1);
  expect(cancelManual).toHaveBeenCalledWith(manual);
  expect(screen.getByText("Catatan dibatalkan", { selector: "strong" }).parentElement!.textContent).toMatch(/Jatah Arief dikembalikan/);
  await waitFor(() => expect(recent().textContent).not.toMatch(/Arief · Kopi Susu/));
  await waitFor(() => expect(screen.getByText("Selesai", { selector: "dt" }).nextElementSibling?.textContent).toBe("2"));
  expect(server.orders.find(order => order.id === manual)).toMatchObject({ status: "batal", manual: true, processed: { label: "Dewi" } });
});

it("says so when the record was already cancelled in another window", async () => {
  const server = createSampleServer();
  const manual = server.seedManual().id;
  render(<CoffeeAdminApp view="antrean" initial={{ queue: await server.api.queue() }} now={NOW} personName={SAMPLE_ACTOR.name} api={server.api} routing="memory" />);
  await server.api.cancelManual(manual);
  fireEvent.click(within(recent()).getByRole("button", { name: /Batalkan catatan/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Batalkan catatan" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Catatan ini sudah dibatalkan\./));
  await waitFor(() => expect(within(recent()).queryByRole("button", { name: /Batalkan catatan/ })).toBeNull());
});
