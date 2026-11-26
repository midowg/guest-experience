import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { coffeePath } from "@/lib/routes";
import { DEFAULT_OPTIONS, DRINKS, NO_OPTIONS } from "@/lib/coffee/menu";
import { GaApp } from "./GaApp";
import { HOLD_REFRESH_MS } from "./hold";
import { SAMPLE_GA, SAMPLE_PEOPLE, SAMPLE_REFUSAL, createSampleGa } from "./sample";
import { forget, NOW, rest } from "./testing";
import { POLL_MS } from "./useGa";

/*
 * GA's tablet on the make-believe server (26 Nov 2026): today's orders, a new order from the room
 * to the sent screen, a double tap, the status that changes while the tablet is open, Tambah lagi,
 * the order that can no longer be added to, a network that goes away, and drinks that are not
 * thrown away without a yes. Made-up people only.
 */
type Options = Parameters<typeof createSampleGa>[0];
const PIC = SAMPLE_PEOPLE[0], TEAM = SAMPLE_PEOPLE[3];

function open(options: Options = {}) {
  const server = createSampleGa({ seeded: true, ...options });
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send), checkPin: vi.fn(server.api.checkPin) };
  render(<GaApp initial={server.initial()} me={{ name: SAMPLE_GA }} api={api} />);
  rest();
  return { server, api };
}
const press = (name: string | RegExp) => { fireEvent.click(screen.getByRole("button", { name })); rest(); };
const tile = (drink: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Tambah ${drink}(,|$)`) }));
const person = (name: string) => fireEvent.click(screen.getByText(name).closest("button")!);
/** Beranda → Pesanan baru → the room on the floor plan and the PIC → Input cepat. */
function start(room = "Vasuki Room") {
  press("Pesanan baru");
  fireEvent.click(screen.getByRole("button", { name: `Pilih ${room}` }));
  person(PIC.name);
  press("Input cepat");
}
const sentHeading = (name: string) => screen.findByRole("heading", { level: 1, name });
/** The make-believe pengelola acts, and the tablet's next read (fifteen seconds later) shows it. */
async function nextRead(pengelola: () => void) {
  pengelola();
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
}
const order = () => screen.getByRole("region", { name: "Pesanan" });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forget(); });

it("opens on today's meeting orders, with each room's status in words next to the floor plan", () => {
  open();
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeTruthy();
  expect(screen.getByText("2 pesanan · 1 sedang diproses")).toBeTruthy();
  expect(screen.getByText(SAMPLE_GA)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Aplikasi saya" }).getAttribute("href")).toBe(coffeePath.home);
  const cards = within(screen.getByRole("main")).getAllByRole("listitem").filter(item => item.querySelector("dl"));
  expect(cards).toHaveLength(2);
  // Newest first: the one still waiting, then the one that is done.
  expect(within(cards[0]).getByText("Vasuki Room")).toBeTruthy();
  expect(within(cards[0]).getByText("Menunggu pengelola")).toBeTruthy();
  expect(within(cards[1]).getByText("Selesai diproses oleh Dewi · 08.32")).toBeTruthy();
  expect(within(cards[1]).getByText("PT Sinar Jaya (contoh) · 4 orang")).toBeTruthy();
  expect(within(cards[1]).getByText("5 minuman · Tamu 4 · Tim · rapat 1")).toBeTruthy();
  expect(within(cards[1]).getByText("#T-0113 · 08.25")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Denah kantor: ruangan dengan pesanan hari ini" }).textContent).toContain("AnantaSelesai");
  const rooms = within(screen.getByRole("list", { name: "Status per ruangan" })).getAllByRole("listitem").map(item => item.textContent);
  expect(rooms).toEqual(["CFC Ananta RoomSelesai", "Kaliya LimasanTidak ada", "Vasuki RoomDiproses", "Komunal SpaceTidak ada"]);
  expect(within(screen.getByRole("list", { name: "Keterangan warna" })).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Diproses", "Selesai", "Ditolak", "Mesin kopi"]);
});

it("invites a first order when nothing was ordered yet", () => {
  open({ seeded: false });
  expect(screen.getByRole("heading", { level: 2, name: "Belum ada pesanan rapat hari ini" })).toBeTruthy();
  expect(screen.getByText("0 pesanan · 0 sedang diproses")).toBeTruthy();
});

it("needs a room and a PIC, and nothing else, before the drinks", () => {
  open();
  press("Pesanan baru");
  const quick = () => screen.getByRole("button", { name: "Input cepat" }) as HTMLButtonElement;
  expect(quick().disabled).toBe(true);
  expect(screen.getByText("Pilih ruangan dan PIC dulu.")).toBeTruthy();
  // Lainnya is typed in.
  fireEvent.click(screen.getByRole("button", { name: "Lainnya" }));
  expect(screen.getByText("Tulis nama tempat dan pilih PIC dulu.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Nama tempat"), { target: { value: "Lobi depan" } });
  expect(screen.getByText("Pilih PIC dulu.")).toBeTruthy();
  // The PIC is found by name, position or BU.
  fireEvent.change(screen.getByLabelText("Cari karyawan PIC"), { target: { value: "finance" } });
  expect(within(screen.getByRole("list", { name: "Karyawan" })).getAllByRole("button")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Cari karyawan PIC"), { target: { value: "" } });
  expect(screen.getByText("4 nama lain. Ketik untuk mempersempit.")).toBeTruthy();
  person(PIC.name);
  expect(quick().disabled).toBe(false);
  // The floor plan and the chips are the same choice.
  fireEvent.click(screen.getByRole("button", { name: "Pilih Kaliya Limasan" }));
  expect(screen.getByRole("button", { name: "Kaliya Limasan" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByLabelText("Nama tempat")).toBeNull();
  // Guest and head count are optional.
  fireEvent.click(screen.getByRole("button", { name: /Tamu dan jumlah orang/ }));
  fireEvent.change(screen.getByLabelText("Tamu atau instansi"), { target: { value: "PT Maju (contoh)" } });
  fireEvent.click(within(screen.getByRole("group", { name: "Jumlah orang" })).getByRole("button", { name: "Tambah" }));
  press("Input cepat");
  expect(screen.getByText(`Kaliya Limasan · PIC ${PIC.name} · PT Maju (contoh) · 1 orang`)).toBeTruthy();
  // "Ubah data" goes back to the form as it was filled.
  press("Ubah data");
  expect(screen.getByRole("button", { name: "Kaliya Limasan" }).getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByLabelText("Tamu atau instansi") as HTMLInputElement).value).toBe("PT Maju (contoh)");
});

it("sends one order for the room: guests under the PIC, a team member under their own name", async () => {
  const { api, server } = open();
  start();
  tile("Americano");
  tile("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Tim · rapat" }));
  tile("Kopi Susu");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: TEAM.name }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tambahkan" }));
  fireEvent.click(screen.getByRole("button", { name: "Kirim 3 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send).toHaveBeenCalledTimes(1);
  const body = api.send.mock.calls[0][0];
  expect(body).toMatchObject({ room: "Vasuki Room", picId: PIC.id, items: [
    { for: "tamu", slug: "americano", temperature: "panas", sugar: "Normal", qty: 2 },
    { for: "tim", personId: TEAM.id, slug: "kopi-susu", qty: 1 },
  ] });
  expect(body.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(body.parentId).toBeUndefined();
  expect(body.items[0].personId).toBeUndefined();
  expect(server.orders).toHaveLength(3);
  expect(screen.getByText("#T-0115 · Vasuki Room")).toBeTruthy();
  expect(screen.getByText(`10.00 · oleh ${SAMPLE_GA}`)).toBeTruthy();
  expect(screen.getByText("Menunggu pengelola (HR atau admin)")).toBeTruthy();
  expect(screen.getByText(`Tim · rapat · ${TEAM.name}`)).toBeTruthy();
  expect(screen.getByText("3 minuman · Tamu 2 · Tim · rapat 1")).toBeTruthy();
  expect(within(screen.getByRole("status")).getByText("Pesanan terkirim ke pengelola.")).toBeTruthy();
  // The focus is on the new screen, not lost with the button that was pressed.
  expect(document.activeElement).toBe(screen.getByRole("main"));
  rest();
  press("Ke beranda");
  expect(screen.getByText("3 pesanan · 2 sedang diproses")).toBeTruthy();
});

it("sends once however often Kirim is pressed while the answer is on its way", async () => {
  const { api, server } = open({ delay: 300 });
  start();
  tile("Kopi Hitam");
  const kirim = screen.getByRole("button", { name: "Kirim 1 minuman" });
  fireEvent.click(kirim);
  fireEvent.click(kirim);
  expect(screen.getByRole("button", { name: "Mengirim…" }).getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Mengirim…" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(server.orders).toHaveLength(3);
  // The second tap of a double tap does not run on into "Tambah lagi" or "Ke beranda" either.
  fireEvent.click(screen.getByRole("button", { name: "Tambah lagi untuk rapat ini" }));
  fireEvent.click(screen.getByRole("button", { name: "Ke beranda" }));
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan terkirim" })).toBeTruthy();
});

it("shows the pengelola's answer by itself: done with the pantry and the ice, refused with the note", async () => {
  const { server, api } = open({ seeded: false });
  start();
  tile("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Ubah Americano, Tamu" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Es" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Simpan" }));
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  const reads = api.state.mock.calls.length;
  await nextRead(() => { vi.setSystemTime(new Date("2026-11-26T03:09:00.000Z")); server.settle("selesai"); });
  expect(api.state.mock.calls.length).toBe(reads + 1);
  expect(screen.getByRole("heading", { level: 1, name: "Siap diambil di mesin pantry" })).toBeTruthy();
  expect(screen.getByText("Selesai diproses oleh Dewi · 10.09")).toBeTruthy();
  expect(screen.getByText("Sekarang · tambahkan es untuk 1 minuman Es")).toBeTruthy();
  expect(screen.getByText("1 minuman Es: tambahkan es di pantry sebelum diantar.")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Denah kantor, pantry ditandai" })).toBeTruthy();
  expect(within(screen.getByRole("status")).getByText("#T-0113 Vasuki Room: siap diambil")).toBeTruthy();
  // Nothing waits any more: the tablet stops asking.
  const quiet = api.state.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
  expect(api.state.mock.calls.length).toBe(quiet);

  // A second round, refused: the note, and the way to a replacement.
  press("Tambah lagi untuk rapat ini");
  expect(screen.getByRole("heading", { level: 1, name: "Tambah lagi untuk #T-0113" })).toBeTruthy();
  tile("Café Latte");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send.mock.calls[1][0]).toMatchObject({ parentId: server.orders[0].id });
  expect(api.send.mock.calls[1][0].key).not.toBe(api.send.mock.calls[0][0].key);
  expect(screen.getByText("#T-0113-2 · Vasuki Room")).toBeTruthy();
  expect(screen.getByText("Tambahan ke-1")).toBeTruthy();
  await nextRead(() => { server.settle("ditolak"); });
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan ditolak" })).toBeTruthy();
  expect(screen.getByText("Catatan dari Dewi")).toBeTruthy();
  expect(screen.getByText(SAMPLE_REFUSAL)).toBeTruthy();
  expect(screen.getByText("Kabari PIC, lalu buat pesanan pengganti.")).toBeTruthy();
  // The first round is still open, so the replacement joins the same meeting.
  expect(screen.getByRole("button", { name: "Tambah lagi untuk rapat ini" })).toBeTruthy();
});

it("starts a replacement order, not a next round, when the first sending was refused", async () => {
  const { server, api } = open({ seeded: false });
  start();
  tile("Café Latte");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  await nextRead(() => { server.settle("ditolak"); });
  rest();
  press("Buat pesanan pengganti");
  expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy();
  expect(screen.getByText(`Vasuki Room · PIC ${PIC.name}`)).toBeTruthy();
  tile("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send.mock.calls[1][0].parentId).toBeUndefined();
  expect(api.send.mock.calls[1][0]).toMatchObject({ room: "Vasuki Room", picId: PIC.id });
  expect(screen.getByText("#T-0114 · Vasuki Room")).toBeTruthy();
});

it("when the server no longer adds to the first sending, keeps the drinks and sends them as a new order", async () => {
  const { server, api } = open();
  // The tablet still believes the waiting order is open; a pengelola refused it a moment ago.
  server.settle("ditolak");
  press("Tambah lagi untuk #T-0114 Vasuki Room");
  tile("Kopi Hitam");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  const alert = await within(order()).findByRole("alert");
  expect(alert.textContent).toBe("Pesanan awal sudah tidak bisa ditambah. Buat pesanan baru. Tekan Kirim lagi untuk mengirimnya sebagai pesanan baru.");
  expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy();
  expect(within(order()).getByText("1 minuman · Tamu 1")).toBeTruthy();
  expect(server.orders).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send.mock.calls[1][0].parentId).toBeUndefined();
  expect(api.send.mock.calls[1][0].key).not.toBe(api.send.mock.calls[0][0].key);
  expect(screen.getByText("#T-0115 · Vasuki Room")).toBeTruthy();
});

it("keeps the drinks when the network is gone, and the retry is the same sending", async () => {
  const { server, api } = open();
  start();
  tile("Americano");
  server.setOffline(true);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  expect((await within(order()).findByRole("alert")).textContent).toBe("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  expect(within(order()).getByText("1 minuman · Tamu 1")).toBeTruthy();
  server.setOffline(false);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send.mock.calls[1][0].key).toBe(api.send.mock.calls[0][0].key);
  expect(server.orders).toHaveLength(3);
});

it("does not throw unsent drinks away without a yes", async () => {
  const { api } = open();
  press("Tambah lagi untuk #T-0113 CFC Ananta Room");
  tile("Americano");
  tile("Kopi Susu");
  press("Beranda");
  const ask = () => screen.getByRole("alertdialog");
  expect(within(ask()).getByRole("heading", { name: "Buang pesanan yang belum dikirim?" })).toBeTruthy();
  expect(within(ask()).getByText("2 minuman untuk CFC Ananta Room belum dikirim ke pengelola.")).toBeTruthy();
  expect(document.activeElement).toBe(within(ask()).getByRole("button", { name: "Lanjutkan pesanan" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(within(order()).getByText("2 minuman · Tamu 2")).toBeTruthy();
  press("Beranda");
  fireEvent.click(within(ask()).getByRole("button", { name: "Buang" }));
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan rapat hari ini" })).toBeTruthy();
  expect(api.send).not.toHaveBeenCalled();
  // Coming back to Beranda reads today's orders once more (another tablet may have sent some).
  await waitFor(() => expect(api.state).toHaveBeenCalled());
  // With nothing to lose there is no question.
  press("Tambah lagi untuk #T-0113 CFC Ananta Room");
  press("Beranda");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("opens an order's status from its card", () => {
  open();
  press("Status #T-0113 CFC Ananta Room");
  expect(screen.getByRole("heading", { level: 1, name: "Siap diambil di mesin pantry" })).toBeTruthy();
  expect(screen.getByText("1 minuman Es: tambahkan es di pantry sebelum diantar.")).toBeTruthy();
});

it("sends the name a guest gave with that drink, and shows what the server kept", async () => {
  const { api } = open({ seeded: false });
  press("Pesanan baru");
  fireEvent.click(screen.getByRole("button", { name: "Pilih Vasuki Room" }));
  person(PIC.name);
  press("Serahkan ke tamu");
  press("Buka buku menu");
  press(/^Kopi Susu/);
  fireEvent.change(screen.getByLabelText(/^Nama Anda/), { target: { value: "Pak Budi" } });
  press("Pilih minuman ini");
  press("Serahkan kembali ke GA");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" }));
  rest();
  tile("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 2 minuman" }));
  await sentHeading("Pesanan terkirim");
  // The name goes with the guest's own drink, and with nothing else (PM decision 26 Nov: the pengelola and the recap see it).
  const items = api.send.mock.calls[0][0].items;
  expect(items.map(item => [item.slug, item.for, item.guestName])).toEqual([["kopi-susu", "tamu", "Pak Budi"], ["americano", "tamu", undefined]]);
  // What shows is what the server answered with, so it survives a reload and shows on another tablet.
  expect(screen.getByText("Tamu · Pak Budi")).toBeTruthy();
  const { server } = { server: api };
  expect((await server.state()).today[0].items.map(item => item.guestName)).toEqual(["Pak Budi", undefined]);
});

/* ---------- after the F3 audit (26 Nov 2026) */

/** What a page loaded in guest mode carries: the menu and the options, no GA data. */
const EMPTY = { menu: DRINKS, options: DEFAULT_OPTIONS, today: [], people: [], rooms: [], pin: false };
const allTimers = () => { vi.useRealTimers(); vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] }); vi.setSystemTime(new Date(NOW)); };
const soon = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
/** Beranda → Pesanan baru → room and PIC → Serahkan ke tamu → the open book. */
function handOver() {
  press("Pesanan baru");
  fireEvent.click(screen.getByRole("button", { name: "Pilih Vasuki Room" }));
  person(PIC.name);
  press("Serahkan ke tamu");
  press("Buka buku menu");
}
function guestPicks(drink: string, name = "") {
  press(new RegExp(`^${drink}`));
  if (name) fireEvent.change(screen.getByLabelText(/^Nama Anda/), { target: { value: name } });
  press("Pilih minuman ini");
}
const yes = () => { fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" })); rest(); };

// Audit F5-06: the cookie lives twelve hours; a book left open longer must still be in guest mode at the next reload.
it("F5-06 writes the guest-mode cookie again while the book is open, and not once the GA officer is back", () => {
  const gone = () => { document.cookie = "coffee_ga_tamu=; path=/; max-age=0"; };
  open();
  start();
  press("Serahkan ke tamu");
  expect(document.cookie).toContain("coffee_ga_tamu=1");
  // As if it had run out: half an hour later it is there again.
  gone();
  expect(document.cookie).not.toContain("coffee_ga_tamu=1");
  act(() => { vi.advanceTimersByTime(HOLD_REFRESH_MS + 1000); });
  expect(document.cookie).toContain("coffee_ga_tamu=1");
  // And whenever the tablet is looked at again (woken up, the browser brought back).
  gone();
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(document.cookie).toContain("coffee_ga_tamu=1");
  // Back in Mode GA: the cookie is gone and stays gone.
  press("Mode GA");
  yes();
  expect(document.cookie).not.toContain("coffee_ga_tamu=1");
  act(() => { vi.advanceTimersByTime(HOLD_REFRESH_MS * 3); document.dispatchEvent(new Event("visibilitychange")); });
  expect(document.cookie).not.toContain("coffee_ga_tamu=1");
});

it("F3-01 comes back to the menu book after a reload in guest mode: no GA data on the page, nothing asked, nothing lost", async () => {
  const first = open();
  start();
  tile("Americano"); // GA's own unsent drink
  press("Serahkan ke tamu");
  press("Buka buku menu");
  guestPicks("Kopi Susu", "Pak Budi");
  expect(document.cookie).toContain("coffee_ga_tamu=1");
  // The reload: the page is gone; the server saw the cookie and sends no GA data with the new one.
  cleanup();
  const api = { state: vi.fn(first.server.api.state), send: vi.fn(first.server.api.send), checkPin: vi.fn(first.server.api.checkPin) };
  render(<GaApp held initial={EMPTY} me={{ name: SAMPLE_GA }} api={api} tools={<p>kotak pratinjau</p>} />);
  rest();
  expect(screen.getByRole("region", { name: "Buku menu tamu" })).toBeTruthy();
  // The book is open where it was, with the guest's pick.
  expect(screen.getByText("1 pilihan sudah tercatat")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Pesanan rapat hari ini" })).toBeNull();
  expect(screen.queryByRole("main")).toBeNull();
  expect(screen.queryByText(SAMPLE_GA)).toBeNull();
  expect(screen.queryByText("kotak pratinjau")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  for (const who of SAMPLE_PEOPLE.filter(item => item.id !== PIC.id)) expect(document.body.textContent).not.toContain(who.name);
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online")); });
  expect(api.state).not.toHaveBeenCalled();
  // The GA officer leaves the book: the guest's pick joins GA's unsent drink, and only now GA's data is read.
  press("Mode GA");
  yes();
  await waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
  expect(within(order()).getByText("2 minuman · Tamu 2")).toBeTruthy();
  expect(within(order()).getByText("Tamu · Pak Budi")).toBeTruthy();
  expect(screen.getByText(`Vasuki Room · PIC ${PIC.name}`)).toBeTruthy();
  expect(document.cookie).not.toContain("coffee_ga_tamu=1");
  expect(window.sessionStorage.getItem("coffee:ga:tamu")).toBeNull();
});

it("F3-01 stays locked on the cover when guest mode was on and nothing can be restored", async () => {
  const server = createSampleGa({ seeded: true });
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send), checkPin: vi.fn(server.api.checkPin) };
  render(<GaApp held initial={EMPTY} me={{ name: SAMPLE_GA }} api={api} />);
  rest();
  expect(screen.getByRole("button", { name: "Buku menu tertutup" })).toBeTruthy();
  expect(screen.getByText("Mohon panggil petugas kami")).toBeTruthy();
  press("Buku menu tertutup");
  expect(screen.queryByText(/Selamat datang|Disajikan khusus/)).toBeNull();
  expect(api.state).not.toHaveBeenCalled();
  expect(screen.queryByRole("main")).toBeNull();
  press("Mode GA");
  yes();
  // Back on Beranda, and today's orders are read now.
  expect(await screen.findByText("2 pesanan · 1 sedang diproses")).toBeTruthy();
});

it("F3-01 offers no way out of the book by a pull, a long press or a drag", () => {
  open();
  expect(document.documentElement.style.overscrollBehavior).toBe("none");
  expect(document.body.style.overscrollBehavior).toBe("none");
  handOver();
  const book = screen.getByRole("region", { name: "Buku menu tamu" });
  expect(fireEvent.contextMenu(book.querySelector("img")!)).toBe(false);
  expect(fireEvent.dragStart(book.querySelector("img")!)).toBe(false);
  expect([...book.querySelectorAll("img")].every(image => image.getAttribute("draggable") === "false")).toBe(true);
  cleanup();
  expect(document.documentElement.style.overscrollBehavior).toBe("");
});

it("F3-04 leaves the book only with the PIN GA: a wrong one says so and stays, the right one opens Mode GA", async () => {
  const { api } = open({ pin: "4821" });
  expect(screen.queryByText(/PIN GA belum diatur/)).toBeNull();
  handOver();
  guestPicks("Kopi Susu");
  press("Mode GA");
  const ask = () => screen.getByRole("alertdialog", { name: "Masukkan PIN GA" });
  const key = (digit: string) => fireEvent.click(within(ask()).getByRole("button", { name: digit }));
  // A keypad, not a text field: no on-screen keyboard comes up, and the focus rests on the title.
  expect(ask().querySelector("input")).toBeNull();
  expect(document.activeElement).toBe(within(ask()).getByRole("heading", { name: "Masukkan PIN GA" }));
  expect(within(ask()).queryByRole("button", { name: "Ya, mode GA" })).toBeNull();
  expect(within(ask()).getByRole("img", { name: "0 dari 4 angka diisi" })).toBeTruthy();
  for (const digit of ["1", "1", "1"]) key(digit);
  expect(within(ask()).getByRole("img", { name: "3 dari 4 angka diisi" })).toBeTruthy();
  fireEvent.click(within(ask()).getByRole("button", { name: "Hapus angka terakhir" }));
  expect(within(ask()).getByRole("img", { name: "2 dari 4 angka diisi" })).toBeTruthy();
  expect(api.checkPin).not.toHaveBeenCalled();
  key("1"); key("1");
  await waitFor(() => expect(within(ask()).getByRole("alert").textContent).toBe("PIN tidak cocok. Coba lagi."));
  expect(api.checkPin).toHaveBeenCalledWith("1111");
  expect(within(ask()).getByRole("img", { name: "0 dari 4 angka diisi" })).toBeTruthy();
  expect(screen.queryByRole("main")).toBeNull();
  // Batal stays in the book.
  fireEvent.click(within(ask()).getByRole("button", { name: "Batal" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("region", { name: "Buku menu tamu" })).toBeTruthy();
  press("Mode GA");
  for (const digit of ["4", "8", "2", "1"]) key(digit);
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy());
  expect(api.checkPin).toHaveBeenLastCalledWith("4821");
  expect(within(order()).getByText("1 minuman · Tamu 1")).toBeTruthy();
  // The PIN was never written anywhere on the page or kept in the tab.
  expect(document.body.innerHTML).not.toContain("4821");
});

it("F3-04 says on Beranda that the PIN GA is missing, and stops trying PINs when the server says enough", async () => {
  const plain = open();
  expect(screen.getByText(/PIN GA belum diatur — minta pengelola mengaturnya/)).toBeTruthy();
  cleanup(); forget();
  const { api } = open({ pin: "4821" });
  handOver();
  press("Mode GA");
  const ask = () => screen.getByRole("alertdialog");
  for (let round = 0; round < 11; round++) {
    for (const digit of ["0", "0", "0", "0"]) fireEvent.click(within(ask()).getByRole("button", { name: digit }));
    await waitFor(() => expect(api.checkPin).toHaveBeenCalledTimes(round + 1));
    await waitFor(() => expect(within(ask()).getByRole("alert").textContent).not.toBe("Memeriksa…"));
    await waitFor(() => expect(within(ask()).getByRole("img", { name: "0 dari 4 angka diisi" })).toBeTruthy());
  }
  expect(within(ask()).getByRole("alert").textContent).toBe("Terlalu sering dalam waktu singkat. Tunggu sepuluh menit lalu coba lagi.");
  // Even the right PIN is refused now; the guest is still in the book.
  for (const digit of ["4", "8", "2", "1"]) fireEvent.click(within(ask()).getByRole("button", { name: digit }));
  await waitFor(() => expect(api.checkPin).toHaveBeenCalledTimes(12));
  expect(screen.getByRole("region", { name: "Buku menu tamu" })).toBeTruthy();
  expect(plain.api.checkPin).not.toHaveBeenCalled();
});

it("F3-04 falls back to the question when the pengelola took the PIN away meanwhile", async () => {
  const { server } = open({ pin: "4821" });
  handOver();
  server.setPin("");
  press("Mode GA");
  for (const digit of ["4", "8", "2", "1"]) fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: digit }));
  expect(await screen.findByRole("alertdialog", { name: "Kembali ke mode GA?" })).toBeTruthy();
});

it("F3-02 shows the order whose answer was lost as sent, instead of sending it again", async () => {
  const { server, api } = open();
  start();
  tile("Americano");
  server.loseAnswers(1);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(server.orders).toHaveLength(3);
  expect(screen.getByText("#T-0115 · Vasuki Room")).toBeTruthy();
});

it("F3-02 never loses drinks added after a lost answer: the first sending is found, the rest goes as Tambah lagi", async () => {
  const { server, api } = open();
  start();
  tile("Americano");
  server.loseAnswers(1);
  api.state.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  expect((await within(order()).findByRole("alert")).textContent).toBe("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  expect(server.orders).toHaveLength(3); // it arrived; the tablet does not know
  // GA adds two drinks and sends again.
  tile("Kopi Susu"); tile("Kopi Susu");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 3 minuman" }));
  const said = await within(order()).findByRole("alert");
  await waitFor(() => expect(said.textContent).toMatch(/^Kiriman sebelumnya ternyata sudah masuk sebagai #T-0115 \(1 minuman\)\. Hapus minuman yang sudah terkirim/));
  // Nothing was sent a second time, nothing was dropped: the three rows are still there, and the screen did not claim "terkirim".
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(server.orders).toHaveLength(3);
  expect(within(order()).getByText("3 minuman · Tamu 3")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1, name: "Tambah lagi untuk #T-0115" })).toBeTruthy();
  // The Americano went out already: GA takes it off and sends the rest as the next round.
  fireEvent.click(within(within(order()).getByRole("group", { name: "Jumlah Americano" })).getByRole("button", { name: "Kurangi" }));
  fireEvent.click(screen.getByRole("button", { name: "Kirim 2 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send).toHaveBeenCalledTimes(2);
  expect(api.send.mock.calls[1][0].key).not.toBe(api.send.mock.calls[0][0].key);
  expect(api.send.mock.calls[1][0].parentId).toBe(server.orders[2].id);
  expect(server.orders.map(item => item.no)).toEqual(["T-0113", "T-0114", "T-0115", "T-0115-2"]);
  expect(server.orders[3].items.map(item => [item.slug, item.qty])).toEqual([["kopi-susu", 2]]);
});

it("F3-02 gives changed contents a key of their own, and does not send them while it cannot find out about the first sending", async () => {
  const { server, api } = open();
  start();
  tile("Americano");
  server.setOffline(true);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await within(order()).findByRole("alert");
  tile("Kopi Susu");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 2 minuman" }));
  await waitFor(() => expect(within(order()).getByRole("alert").textContent).toMatch(/^Belum tersambung, jadi belum diketahui apakah kiriman sebelumnya sudah masuk/));
  expect(api.send).toHaveBeenCalledTimes(1);
  // Back online: the first sending never arrived, so the changed order goes out whole, under a new key.
  server.setOffline(false);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 2 minuman" }));
  await sentHeading("Pesanan terkirim");
  expect(api.send).toHaveBeenCalledTimes(2);
  expect(api.send.mock.calls[1][0].key).not.toBe(api.send.mock.calls[0][0].key);
  expect(server.orders).toHaveLength(3);
  expect(server.orders[2].items.map(item => item.slug)).toEqual(["americano", "kopi-susu"]);
});

it("F3-02 the make-believe server, as the real one, refuses a key that comes back with other contents", async () => {
  const server = createSampleGa({ seeded: false });
  const key = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
  const body = { room: "Vasuki Room", picId: PIC.id, key, items: [{ for: "tamu" as const, slug: "americano", temperature: "panas" as const, sugar: "Normal" as const, ice: "Normal" as const, qty: 1 }] };
  const first = await server.api.send(body);
  expect((await server.api.send(body)).order.id).toBe(first.order.id);
  await expect(server.api.send({ ...body, items: [{ ...body.items[0], qty: 3 }] })).rejects.toMatchObject({ status: 409 });
  expect(server.orders).toHaveLength(1);
});

it("F3-03 a message about another order never takes the screen away from drinks that are being written", async () => {
  const { server } = open();
  // The waiting order is refused while GA is on Beranda: the message can open it.
  await nextRead(() => { server.settle("ditolak"); });
  rest();
  const message = () => screen.getByRole("button", { name: /#T-0114 Vasuki Room: ditolak/ });
  // GA starts a replacement and taps three drinks, the message still on top.
  press("Pesan pengganti untuk #T-0114 Vasuki Room");
  tile("Americano"); tile("Kopi Susu"); tile("Kopi Hitam");
  fireEvent.click(message());
  rest();
  expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy();
  expect(within(order()).getByText("3 minuman · Tamu 3")).toBeTruthy();
  expect(screen.queryByRole("heading", { level: 1, name: "Pesanan ditolak" })).toBeNull();
});

it("F3-05 gives up a Kirim that hangs: says so, keeps the drinks, and the next Kirim is the same sending", async () => {
  allTimers();
  const { server, api } = open();
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.click(screen.getByRole("button", { name: "Pesanan baru" })); act(() => { vi.advanceTimersByTime(500); });
  fireEvent.click(screen.getByRole("button", { name: "Pilih Vasuki Room" }));
  person(PIC.name);
  fireEvent.click(screen.getByRole("button", { name: "Input cepat" })); act(() => { vi.advanceTimersByTime(500); });
  tile("Americano");
  server.hangNext(1);
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole("button", { name: "Mengirim…" })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(13_000); });
  expect(within(order()).getByRole("alert").textContent).toBe("Server terlalu lama menjawab. Periksa jaringan lalu coba lagi.");
  expect(within(order()).getByText("1 minuman · Tamu 1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan terkirim" })).toBeTruthy();
  expect(api.send.mock.calls[1][0].key).toBe(api.send.mock.calls[0][0].key);
  expect(server.orders).toHaveLength(3);
});

it("F3-05 says when the status could not be read, keeps reading after a read that hung, and goes quiet once it works", async () => {
  allTimers();
  const { server, api } = open();
  expect(screen.queryByText(/Tidak tersambung/)).toBeNull();
  server.hangNext(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); }); // this read hangs
  expect(api.state).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(18_000); });
  const banner = screen.getByText("Tidak tersambung. Status mungkin belum terbaru.").parentElement!;
  expect(banner.getAttribute("role")).toBe("status");
  server.settle("selesai");
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
  expect(api.state.mock.calls.length).toBeGreaterThan(1);
  expect(screen.queryByText(/Tidak tersambung/)).toBeNull();
  expect(screen.getByText("2 pesanan · 0 sedang diproses")).toBeTruthy();
  // Offline: the banner at once, with a way to try again.
  server.setOffline(true);
  await act(async () => { window.dispatchEvent(new Event("offline")); });
  const reads = api.state.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(api.state.mock.calls.length).toBe(reads + 1);
  expect(screen.getByText(/Tidak tersambung/)).toBeTruthy();
  server.setOffline(false);
  await act(async () => { window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(50); });
  expect(screen.queryByText(/Tidak tersambung/)).toBeNull();
});

it("F3-06 the back button walks the tablet's screens and closes dialogs instead of leaving the page", async () => {
  open();
  const leaves = vi.spyOn(window.history, "back");
  const back = async () => { await act(async () => { leaves.mockClear(); window.history.go(-1); await new Promise(resolve => setTimeout(resolve, 40)); }); rest(); };
  expect(window.history.state?.gaTrap).toBe(true);
  start();
  tile("Americano");
  // A dialog is open: back closes it, the row stays.
  fireEvent.click(within(order()).getByRole("button", { name: /^Ubah Americano/ }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await back();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy();
  // Input cepat → Pesanan baru (as "Ubah data"), with the drink kept.
  await back();
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan baru" })).toBeTruthy();
  // Pesanan baru → Beranda asks first, because a drink is not sent yet; back again closes the question.
  await back();
  expect(screen.getByRole("alertdialog", { name: "Buang pesanan yang belum dikirim?" })).toBeTruthy();
  await back();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Pesanan baru" })).toBeTruthy();
  expect(window.history.state?.gaTrap).toBe(true);
  expect(leaves).not.toHaveBeenCalled();
  leaves.mockRestore();
});

it("F3-06 in the guest's book the back button does nothing at all", async () => {
  open();
  handOver();
  guestPicks("Kopi Susu");
  for (let press = 0; press < 3; press++) await act(async () => { window.history.go(-1); await new Promise(resolve => setTimeout(resolve, 40)); });
  expect(screen.getByRole("region", { name: "Buku menu tamu" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "Pilihan Anda sudah kami terima" })).toBeTruthy();
  expect(screen.queryByRole("main")).toBeNull();
  expect(window.history.state?.gaTrap).toBe(true);
  // With the way out open, back closes it and stays in the book.
  press("Mode GA");
  await act(async () => { window.history.go(-1); await new Promise(resolve => setTimeout(resolve, 40)); });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("region", { name: "Buku menu tamu" })).toBeTruthy();
});

it("F3-12 does not offer Tambah lagi on a record the pengelola made by hand, and names a missing room", async () => {
  const { server } = open();
  await nextRead(() => { server.recordManual(""); });
  const cards = within(screen.getByRole("main")).getAllByRole("listitem").filter(item => item.querySelector("dl"));
  expect(within(cards[0]).getByText("Tanpa ruangan")).toBeTruthy();
  expect(within(cards[0]).getByText("Dicatat manual oleh Dewi")).toBeTruthy();
  expect(within(cards[0]).queryByRole("button", { name: /Tambah lagi/ })).toBeNull();
  expect(within(cards[0]).getByRole("button", { name: /^Pesanan baru untuk #T-0115 Tanpa ruangan/ })).toBeTruthy();
  expect(within(screen.getByRole("list", { name: "Status per ruangan" })).getAllByRole("listitem").map(item => item.textContent)).toContain("Tanpa ruanganSelesai");
});

it("F3-13 keeps a refusal on top until it is closed; what came meanwhile shows after it", async () => {
  const { server } = open();
  start("Kaliya Limasan");
  tile("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  fireEvent.click(screen.getByRole("button", { name: "Tutup pesan" }));
  // #T-0115 is refused; then #T-0114 is done.
  await nextRead(() => { server.settle("ditolak"); });
  const said = () => screen.getByRole("status").textContent ?? "";
  expect(said()).toMatch(/#T-0115 Kaliya Limasan: ditolak/);
  await nextRead(() => { server.settle("selesai"); });
  expect(said()).toMatch(/#T-0115 Kaliya Limasan: ditolak/);
  // It does not leave by itself either.
  await soon();
  expect(said()).toMatch(/ditolak/);
  fireEvent.click(screen.getByRole("button", { name: "Tutup pesan" }));
  expect(said()).toMatch(/#T-0114 Vasuki Room: siap diambil/);
});

it("F3-13 says how many when several orders were decided in one read", async () => {
  const { server } = open();
  start("Kaliya Limasan");
  tile("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  await sentHeading("Pesanan terkirim");
  await nextRead(() => { server.settle("ditolak"); server.settle("selesai"); });
  const said = screen.getByRole("status").textContent ?? "";
  expect(said).toMatch(/2 pesanan sudah diputuskan, 1 ditolak/);
  expect(said).toMatch(/#T-0115 Kaliya Limasan: ditolak/);
  expect(said).toMatch(/#T-0114 Vasuki Room: siap diambil/);
});

// F6: what the team and guests are asked comes with the tablet's state, and follows the pengelola.
it("F6 sends a guest's drink without options when guests are asked nothing, keeps the team's, and the sent screen names the drink alone", async () => {
  const { api } = open({ options: { tim: DEFAULT_OPTIONS.tim, tamu: NO_OPTIONS } });
  start();
  tile("Americano");
  expect(order().textContent).not.toMatch(/Panas|gula/);
  fireEvent.click(screen.getByRole("button", { name: "Tim · rapat" }));
  tile("Kopi Susu");
  expect(within(screen.getByRole("dialog")).getByRole("group", { name: "Gula" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: TEAM.name }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tambahkan" }));
  fireEvent.click(screen.getByRole("button", { name: "Kirim 2 minuman" }));
  await sentHeading("Pesanan terkirim");
  const [guest, team] = api.send.mock.calls[0][0].items;
  expect([guest.temperature, guest.sugar, guest.ice]).toEqual([undefined, undefined, undefined]);
  expect(team).toMatchObject({ for: "tim", temperature: "panas", sugar: "Normal" });
  const rows = within(screen.getByRole("main")).getAllByRole("listitem").filter(item => /1× /.test(item.textContent ?? "")).map(item => item.textContent);
  expect(rows).toEqual(["1× AmericanoTamu", `1× Kopi SusuPanas · gula NormalTim · rapat · ${TEAM.name}`]);
});

it("F6 follows the pengelola on the next read: a hidden drink leaves the tiles, and guests are asked what Pengaturan says by then", async () => {
  const { server } = open();
  server.setMenu(DRINKS.map(drink => drink.slug === "americano" ? { ...drink, active: false } : drink));
  server.setOptions({ tim: DEFAULT_OPTIONS.tim, tamu: { suhu: false, gula: true, es: false } });
  await nextRead(() => undefined);
  start();
  expect(screen.queryByRole("button", { name: /^Tambah Americano/ })).toBeNull();
  tile("Café Latte");
  expect(within(order()).getByText("gula Normal")).toBeTruthy();
});
