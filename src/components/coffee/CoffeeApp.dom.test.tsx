import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { coffeeAdminPath, coffeePath } from "@/lib/routes";
import { CoffeeApp, type CoffeeAppProps } from "./CoffeeApp";
import { SAMPLE_REFUSAL, createSampleCoffee } from "./sample";
import { POLL_MS } from "./useCoffee";

/*
 * The employee app on the make-believe server (26 Nov 2026): the quota, a claim from the sheet to
 * Pesanan saya, a double tap, the quota that filled meanwhile, cancelling, the claim someone
 * processed first, and the status that changes while the app is open. Made-up people only.
 */
const NOW = "2026-11-25T03:00:00.000Z";
type Options = Parameters<typeof createSampleCoffee>[0];

function open(options: Options = {}, props: Partial<CoffeeAppProps> = {}) {
  const server = createSampleCoffee(options);
  const api = { ...server.api, state: vi.fn(server.api.state), claim: vi.fn(server.api.claim), cancel: vi.fn(server.api.cancel), signOut: vi.fn(server.api.signOut) };
  render(<CoffeeApp initial={server.initial()} api={api} routing="memory" {...props} />);
  return { server, api };
}
const tab = (name: RegExp) => within(screen.getByRole("navigation", { name: "Navigasi" })).getByRole("link", { name });
const pick = (drink: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${drink}`) }));
/** Menu → the drink's sheet → Ajukan klaim, and the wait until Pesanan saya shows it. */
async function claim(drink = "Café Latte") {
  pick(drink);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" }));
  await screen.findByRole("heading", { level: 1, name: "Pengajuan sedang diproses" });
}
/** The make-believe pengelola acts, and the next read of the app (fifteen seconds later) shows it. */
async function nextRead(pengelola: () => void) {
  pengelola();
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("greets the person with what is left of the month's quota and the drinks of both kinds", () => {
  const { api } = open();
  expect(screen.getByRole("heading", { level: 1, name: "Halo, Rina (contoh)" })).toBeTruthy();
  expect(screen.getByText("Karyawan · November")).toBeTruthy();
  expect(screen.getByText("Sisa 4 dari 4").parentElement?.textContent).toBe("Sisa 4 dari 4 klaim bulan ini");
  expect(screen.getByRole("tabpanel").querySelectorAll("li")).toHaveLength(10);
  expect(screen.getByRole("button", { name: /^Espresso/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Non-kopi" }));
  expect(screen.getByRole("tabpanel").querySelectorAll("li")).toHaveLength(5);
  expect(screen.getByRole("button", { name: /^Cucumber Ice/ }).querySelector("img")?.getAttribute("src")).toBe(coffeePath.photo("cucumber-ice"));
  // Both tabs are links to their own addresses; moving between them asks the server nothing.
  expect(tab(/Menu/).getAttribute("href")).toBe(coffeePath.home);
  expect(tab(/Pesanan saya/).getAttribute("href")).toBe(coffeePath.orders);
  fireEvent.click(tab(/Pesanan saya/));
  expect(screen.getByRole("heading", { level: 1, name: "Belum ada pesanan" })).toBeTruthy();
  expect(tab(/Pesanan saya/).getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Lihat menu" }));
  expect(screen.getByRole("heading", { level: 1, name: /Halo/ })).toBeTruthy();
  expect(api.state).not.toHaveBeenCalled();
});

it("gives GA and interns their own quota", () => {
  open({ group: "ga" });
  expect(screen.getByText("Tim GA · November")).toBeTruthy();
  expect(screen.getByText("Sisa 2 dari 2")).toBeTruthy();
  cleanup();
  open({ group: "intern", used: 1 });
  expect(screen.getByText("Intern · November")).toBeTruthy();
  expect(screen.getByText("Sisa 1 dari 2")).toBeTruthy();
});

it("sends a claim from the sheet, moves to Pesanan saya and takes one place of the quota", async () => {
  const { api, server } = open({ used: 1 });
  pick("Café Latte");
  const sheet = within(screen.getByRole("dialog", { name: "Café Latte" }));
  expect(sheet.getByText("Ini klaim ke-2 dari 4 bulan November.")).toBeTruthy();
  fireEvent.click(sheet.getByRole("button", { name: "Es" }));
  fireEvent.click(sheet.getByRole("button", { name: "Ajukan klaim" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Pengajuan sedang diproses" })).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.claim).toHaveBeenCalledTimes(1);
  expect(api.claim.mock.calls[0][0]).toMatchObject({ slug: "cafe-latte", temperature: "es", sugar: "Normal", ice: "Normal" });
  const card = screen.getByRole("region", { name: "Café Latte, Diproses" });
  expect(card.textContent).toMatch(/Es · gula Normal · es Normal/);
  expect(card.textContent).toMatch(/#K-419 · klaim ke-2/);
  expect(within(card).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Diajukan10.00", "DiprosesMenunggu pengelola", "Ambil di mesin pantry"]);
  expect(within(card).getByText("Siapa yang memproses?")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toMatch(/Pengajuan terkirim\./);
  // The dot on the tab, and the earlier claim under "Sebelumnya".
  expect(within(tab(/Pesanan saya/)).getByRole("img", { name: "1 pengajuan sedang diproses" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "Sebelumnya" }).parentElement?.textContent).toMatch(/Kopi Susu.*Selesai/);
  fireEvent.click(tab(/Menu/));
  expect(screen.getByText("Sisa 2 dari 4")).toBeTruthy();
  expect(server.orders).toHaveLength(2);
});

it("makes one claim when Ajukan klaim is tapped twice on a slow network", async () => {
  vi.useRealTimers();
  const { api, server } = open({ delay: 30 });
  pick("Americano");
  const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" });
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole("heading", { level: 1, name: "Pengajuan sedang diproses" });
  expect(api.claim).toHaveBeenCalledTimes(1);
  expect(server.orders).toHaveLength(1);
  fireEvent.click(tab(/Menu/));
  expect(screen.getByText("Sisa 3 dari 4")).toBeTruthy();
});

it("shows the used-up quota with the day it comes back, and turns Ajukan klaim off", () => {
  const { api } = open({ used: 4 });
  expect(screen.getByText("Sisa 0 dari 4")).toBeTruthy();
  expect(screen.getByText("Jatah bulan ini sudah habis").parentElement?.textContent).toMatch(/Jatah kembali Selasa, 1 Desember\. Menu tetap bisa dilihat\./);
  pick("Kopi Hitam");
  const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Jatah habis" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(api.claim).not.toHaveBeenCalled();
});

it("keeps the sheet open with the server's reason when the quota filled meanwhile", async () => {
  const { server } = open({ used: 3 });
  pick("Kopi Hitam");
  // The last place was taken elsewhere (another device) before this claim arrives.
  await server.api.claim({ slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", key: "11111111-1111-4111-8111-111111111111" });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" }));
  expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toBe("Jatah bulan ini sudah habis.");
  // The app read the state again: the sheet now says the quota is used up.
  expect(await within(screen.getByRole("dialog")).findByRole("button", { name: "Jatah habis" })).toBeTruthy();
  expect(server.orders).toHaveLength(4);
});

it("cancels a waiting claim after asking, and gives the place back", async () => {
  const { api } = open();
  await claim();
  fireEvent.click(screen.getByRole("button", { name: "Batalkan pengajuan" }));
  const question = within(screen.getByRole("alertdialog", { name: "Batalkan pengajuan?" }));
  expect(question.getByText("Café Latte belum diproses. Jatah kamu dikembalikan.")).toBeTruthy();
  fireEvent.click(question.getByRole("button", { name: "Tidak jadi" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(api.cancel).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Batalkan pengajuan" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batalkan" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Pengajuan dibatalkan" })).toBeTruthy();
  expect(api.cancel).toHaveBeenCalledTimes(1);
  const card = screen.getByRole("region", { name: "Café Latte, Dibatalkan" });
  // A cancelled claim has no place in the quota, so no "klaim ke-".
  expect(card.textContent).toMatch(/#K-418/);
  expect(card.textContent).not.toMatch(/klaim ke-/);
  expect(within(card).queryByRole("list")).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/Pengajuan dibatalkan.*Jatah kamu dikembalikan\./);
  expect(within(tab(/Pesanan saya/)).queryByRole("img")).toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "Kembali ke menu" }));
  expect(screen.getByText("Sisa 4 dari 4")).toBeTruthy();
});

it("says so when the claim was processed before it could be cancelled, and shows where it stands", async () => {
  const { server } = open();
  await claim();
  server.settle("selesai");
  fireEvent.click(screen.getByRole("button", { name: "Batalkan pengajuan" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batalkan" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Silakan ambil di mesin" })).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Pengajuan ini sudah diproses, tidak bisa dibatalkan\.|Silakan ambil di mesin/));
  expect(screen.queryByRole("button", { name: "Batalkan pengajuan" })).toBeNull();
});

it("shows Selesai within fifteen seconds without a reload: who processed it, the pantry, the note about ice", async () => {
  const { server, api } = open();
  pick("Café Latte");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Es" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" }));
  await screen.findByRole("heading", { level: 1, name: "Pengajuan sedang diproses" });
  fireEvent.click(tab(/Menu/));
  const before = api.state.mock.calls.length;
  await nextRead(() => { vi.setSystemTime(new Date("2026-11-25T03:14:00.000Z")); server.settle("selesai"); });
  expect(api.state.mock.calls.length).toBe(before + 1);
  // The message on top, wherever the person is; tapping it opens Pesanan saya.
  const message = screen.getByRole("button", { name: /Silakan ambil di mesin/ });
  expect(message.textContent).toMatch(/Café Latte kamu sudah diproses Dewi\. Ambil di mesin kopi pantry\./);
  fireEvent.click(message);
  expect(screen.getByRole("heading", { level: 1, name: "Silakan ambil di mesin" })).toBeTruthy();
  const card = screen.getByRole("region", { name: "Café Latte, Siap diambil" });
  expect(within(card).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Diajukan10.00", "DiprosesSelesai oleh Dewi · 10.14", "Ambil di mesin pantrySekarang"]);
  expect(within(card).getByRole("img", { name: "Denah kantor, pantry ditandai" })).toBeTruthy();
  expect(card.textContent).toMatch(/Pantry, lantai ini.*Es ditambahkan tim GA di pantry\./);
  expect(card.textContent).toMatch(/klaim ke-1/);
  expect(within(tab(/Pesanan saya/)).queryByRole("img")).toBeNull();
});

it("shows a refusal with its note, gives the place back and shows no claim number", async () => {
  const { server } = open({ used: 1 });
  await claim("Piccolo Latte");
  await nextRead(() => server.settle("ditolak"));
  expect(screen.getByRole("heading", { level: 1, name: "Pengajuan tidak bisa diproses" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Pengajuan tidak bisa diproses/ }).textContent).toMatch(/Piccolo Latte: lihat catatan dari Dewi\. Jatah tidak berkurang\./);
  const card = screen.getByRole("region", { name: "Piccolo Latte, Ditolak" });
  expect(card.textContent).toMatch(new RegExp(`Catatan dari Dewi${SAMPLE_REFUSAL.replace(/[.?]/g, "\\$&")}Jatah kamu tidak berkurang\\.`));
  expect(card.textContent).not.toMatch(/klaim ke-/);
  expect(within(card).queryByRole("list")).toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "Pilih minuman lain" }));
  expect(screen.getByText("Sisa 3 dari 4")).toBeTruthy();
});

it("asks the server only while a claim waits and the app is in front", async () => {
  const { server, api } = open();
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 4); });
  expect(api.state).not.toHaveBeenCalled();
  await claim();
  const afterClaim = api.state.mock.calls.length; // the one read after the action
  expect(afterClaim).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2); });
  expect(api.state.mock.calls.length).toBe(afterClaim + 2);

  // Hidden: nothing is asked. Back in front: asked at once.
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
  expect(api.state.mock.calls.length).toBe(afterClaim + 2);
  server.settle("selesai");
  visibility.mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1, name: "Silakan ambil di mesin" });
  const settled = api.state.mock.calls.length;
  expect(settled).toBe(afterClaim + 3);
  // Nothing waits any more: the timer rests.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 4); });
  expect(api.state.mock.calls.length).toBe(settled);
  visibility.mockRestore();
});

it("shows every waiting claim in full, each with its own cancel", async () => {
  const { server } = open();
  await claim("Café Latte");
  fireEvent.click(tab(/Menu/));
  vi.setSystemTime(new Date("2026-11-25T03:05:00.000Z"));
  pick("Americano");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" }));
  await screen.findByRole("region", { name: "Americano, Diproses" });
  expect(screen.getAllByRole("button", { name: "Batalkan pengajuan" })).toHaveLength(2);
  expect(within(tab(/Pesanan saya/)).getByRole("img", { name: "2 pengajuan sedang diproses" })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  // A claim recorded by hand by the pengelola arrives already done, and says so.
  server.recordManual("classic-tea");
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
  expect(screen.getByRole("heading", { level: 2, name: "Sebelumnya" }).parentElement?.textContent).toMatch(/Classic Tea.*Selesai/);
});

it("offers Mode GA and Pengelola only to who may open them, and signs out", async () => {
  const plain = open();
  fireEvent.click(screen.getByRole("button", { name: "Akun Rina (contoh)" }));
  let account = within(screen.getByRole("dialog", { name: "Rina (contoh)" }));
  expect(account.getByText("Karyawan · sisa 4 dari 4 klaim bulan ini")).toBeTruthy();
  expect(account.queryByRole("link", { name: /Mode GA/ })).toBeNull();
  expect(account.queryByRole("link", { name: /Pengelola/ })).toBeNull();
  fireEvent.click(account.getByRole("button", { name: "Keluar" }));
  await waitFor(() => expect(plain.api.signOut).toHaveBeenCalledTimes(1));
  cleanup();

  open({ ga: true, pengelola: true });
  fireEvent.click(screen.getByRole("button", { name: "Akun Rina (contoh)" }));
  account = within(screen.getByRole("dialog"));
  expect(account.getByRole("link", { name: /Mode GA/ }).getAttribute("href")).toBe(coffeePath.ga);
  expect(account.getByRole("link", { name: /Pengelola/ }).getAttribute("href")).toBe(coffeeAdminPath.home);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("walks through Atur sekali once: pasang di layar utama, then notifikasi, then the menu", async () => {
  open({}, { setup: true, phone: "iphone" });
  expect(screen.getByRole("heading", { level: 1, name: "Pasang di layar utama" })).toBeTruthy();
  expect(screen.getByText("Atur sekali · 1 dari 2")).toBeTruthy();
  expect(screen.getByRole("button", { name: "iPhone" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Tambah ke Layar Utama")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Android" }));
  // The browser offered no install question: the button says how, then moves on.
  fireEvent.click(screen.getByRole("button", { name: "Pasang sekarang" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/menu ⋮/);
  fireEvent.click(screen.getByRole("button", { name: "Sudah, lanjut" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Notifikasi menyusul" })).toBeTruthy();
  expect(screen.getByText("Atur sekali · 2 dari 2")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Izinkan notifikasi/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  fireEvent.click(screen.getByRole("button", { name: "Nanti saja" }));
  fireEvent.click(screen.getByRole("button", { name: "Mulai pesan" }));
  expect(screen.getByRole("heading", { level: 1, name: /Halo/ })).toBeTruthy();
});

it("asks for the notification permission once push is plugged in (F4), and goes on when it is refused", async () => {
  const allow = vi.fn(async () => "denied" as const);
  open({}, { setup: true, notify: { allow } });
  fireEvent.click(screen.getByRole("button", { name: "Nanti saja" }));
  expect(screen.getByRole("heading", { level: 1, name: "Izinkan notifikasi" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Izinkan notifikasi/ }));
  expect((await screen.findByRole("status")).textContent).toMatch(/Aplikasi tetap jalan/);
  expect(allow).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Mulai pesan" }));
  expect(screen.getByRole("heading", { level: 1, name: /Halo/ })).toBeTruthy();
});

it("tells someone without Mode GA why they are back on the menu", () => {
  open({}, { note: "Mode GA hanya untuk tim GA dan pengelola Werkudara Coffee." });
  expect(screen.getByText("Mode GA hanya untuk tim GA dan pengelola Werkudara Coffee.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tutup pesan" }));
  expect(screen.queryByText(/Mode GA hanya/)).toBeNull();
});

it("says the network is gone and keeps the claim for another try", async () => {
  const { server, api } = open();
  server.setOffline(true);
  pick("Americano");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" }));
  expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toBe("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  server.setOffline(false);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajukan klaim" }));
  await screen.findByRole("heading", { level: 1, name: "Pengajuan sedang diproses" });
  expect(api.claim.mock.calls[1][0].key).toBe(api.claim.mock.calls[0][0].key);
  expect(server.orders).toHaveLength(1);
});
