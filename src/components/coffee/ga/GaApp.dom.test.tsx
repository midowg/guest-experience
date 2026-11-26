import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { coffeePath } from "@/lib/routes";
import { GaApp } from "./GaApp";
import { SAMPLE_GA, SAMPLE_PEOPLE, SAMPLE_REFUSAL, createSampleGa } from "./sample";
import { NOW, rest } from "./testing";
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
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send) };
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
afterEach(() => { cleanup(); vi.useRealTimers(); });

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
    { for: "tamu", slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 2 },
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
