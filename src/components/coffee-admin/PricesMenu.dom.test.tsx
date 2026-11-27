import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminApiError } from "@/components/admin/shared/api";
import { MenuView } from "./MenuView";
import { createSampleServer, type SampleMenu, type SampleServer } from "./sample";
import css from "./coffee-admin.module.css";

/*
 * F9 (27 Nov 2026), Menu: the price of each drink in the list, the editor's "Harga satuan (Rp)"
 * (typed with thousand separators, a negative or a decimal refused), the chip "Tanpa harga", the
 * notice on top, and the page before migration 202612050001 has run. Made-up people only.
 */
vi.mock("next/navigation", () => ({ usePathname: () => null }));
const NOW = "2026-11-25T03:00:00.000Z";
type Spied = { [K in keyof SampleServer["api"]]: SampleServer["api"][K] & ReturnType<typeof vi.fn> };

async function open(more: { menu?: SampleMenu; change?: (api: SampleServer["api"]) => Partial<SampleServer["api"]> } = {}) {
  const server = createSampleServer(() => Date.parse(NOW), { menu: more.menu });
  const spied = Object.fromEntries(Object.entries(server.api).map(([name, call]) => [name, vi.fn(call as (...args: never[]) => unknown)])) as unknown as Spied;
  const api = { ...spied, ...more.change?.(server.api) } as Spied;
  const said = vi.fn();
  render(<div className={css.root}><MenuView api={api} initial={await server.api.menu()} active onSaid={said} /></div>);
  return { server, api, said };
}
const rows = () => within(within(screen.getByRole("region", { name: "Daftar minuman" })).getByRole("list")).getAllByRole("listitem");
const row = (name: string) => rows().find(item => item.querySelector("strong")?.textContent === name)!;
const chip = (name: RegExp) => within(screen.getByRole("group", { name: "Saring minuman" })).getByRole("button", { name });
const editor = () => screen.getByRole("dialog");
const price = () => within(editor()).getByLabelText("Harga satuan (Rp)") as HTMLInputElement;
const typePrice = (value: string) => fireEvent.change(price(), { target: { value } });
const openEditor = (drink: string) => fireEvent.click(within(row(drink)).getByRole("button", { name: `Ubah ${drink}` }));
const save = () => fireEvent.click(within(editor()).getByRole("button", { name: /^Simpan$/ }));
const notice = () => screen.queryByText(/minuman belum berharga: pengeluarannya tidak terhitung/);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows each drink's price in the list, and 'Harga belum diisi' in a muted voice where there is none", async () => {
  await open();
  expect(row("Americano").textContent).toMatch(/Rp 8\.000 · Kopi · Panas dan Es/);
  expect(row("Espresso").textContent).toMatch(/Rp 8\.900 · Kopi · Panas/);
  expect(row("Kopi Hitam").textContent).toMatch(/Rp 6\.900/);
  const empty = within(row("Cucumber Ice")).getByText("Harga belum diisi");
  expect(empty.getAttribute("data-empty")).toBe("true");
  expect(row("Cucumber Ice").textContent).not.toMatch(/Rp /);
  // The price is what the machine charges, so the three drinks it does not sell have none.
  expect(rows().filter(item => /Harga belum diisi/.test(item.textContent ?? "")).map(item => item.querySelector("strong")?.textContent)).toEqual(["Cappuccino Double Shot", "Cucumber Ice", "Classic Tea"]);
});

it("says how many shown drinks have no price, and the notice and the chip find them", async () => {
  const { api } = await open();
  expect(notice()?.textContent).toBe("3 minuman belum berharga: pengeluarannya tidak terhitung.");
  expect(chip(/^Tanpa harga/).textContent).toContain("3");
  fireEvent.click(chip(/^Tanpa harga/));
  expect(rows().map(item => item.querySelector("strong")?.textContent)).toEqual(["Cappuccino Double Shot", "Cucumber Ice", "Classic Tea"]);
  expect(chip(/^Tanpa harga/).getAttribute("aria-pressed")).toBe("true");
  // A hidden drink is not on sale: it does not count in the notice, but the chip still lists it.
  fireEvent.click(chip(/^Semua/));
  fireEvent.click(within(row("Classic Tea")).getByRole("button", { name: "Sembunyikan Classic Tea" }));
  await waitFor(() => expect(notice()?.textContent).toBe("2 minuman belum berharga: pengeluarannya tidak terhitung."));
  expect(chip(/^Tanpa harga/).textContent).toContain("3");
  // "Lihat yang kosong" turns the chip on from anywhere.
  fireEvent.click(chip(/^Kopi/));
  fireEvent.click(screen.getByRole("button", { name: "Lihat yang kosong" }));
  expect(chip(/^Tanpa harga/).getAttribute("aria-pressed")).toBe("true");
  expect(api.showDrink).toHaveBeenCalledTimes(1);
});

it("has no notice once every shown drink has a price, and the chip then says so", async () => {
  await open();
  for (const [name, value] of [["Cappuccino Double Shot", "9500"], ["Cucumber Ice", "7000"], ["Classic Tea", "6000"]]) {
    openEditor(name);
    typePrice(value);
    save();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
  expect(notice()).toBeNull();
  expect(chip(/^Tanpa harga/).textContent).toContain("0");
  fireEvent.click(chip(/^Tanpa harga/));
  expect(screen.getByRole("heading", { name: "Semua minuman sudah berharga" })).toBeTruthy();
  fireEvent.click(chip(/^Semua/));
  expect(row("Classic Tea").textContent).toMatch(/Rp 6\.000/);
});

it("labels the field, asks for digits, and explains what the price is for", async () => {
  await open();
  openEditor("Americano");
  const field = price();
  expect(field.inputMode).toBe("numeric");
  expect(field.value).toBe("8.000");
  expect(within(editor()).getByText("Dipakai untuk rekap pengeluaran. Harga pesanan yang sudah masuk tidak berubah. Kosongkan bila belum tahu.")).toBeTruthy();
  expect(field.getAttribute("aria-describedby")).toBeTruthy();
  expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toMatch(/rekap pengeluaran/);
});

it("regroups the digits as they are typed and accepts 8000 as well as 8.000", async () => {
  const { api } = await open();
  openEditor("Cucumber Ice");
  expect(price().value).toBe("");
  typePrice("8");
  expect(price().value).toBe("8");
  typePrice("8000");
  expect(price().value).toBe("8.000");
  typePrice("80000");
  expect(price().value).toBe("80.000");
  // A digit added after the grouping is regrouped, not refused.
  typePrice("8.0000");
  expect(price().value).toBe("80.000");
  typePrice("Rp 9500");
  expect(price().value).toBe("9.500");
  typePrice("007");
  expect(price().value).toBe("7");
  typePrice("12500");
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.updateDrink).toHaveBeenCalledWith("cucumber-ice", expect.objectContaining({ price: 12_500 }));
  expect(row("Cucumber Ice").textContent).toMatch(/Rp 12\.500/);
  openEditor("Cucumber Ice");
  expect(price().value).toBe("12.500");
});

it("regroups on a deletion too, and again when the field is left", async () => {
  await open();
  openEditor("Americano");
  typePrice("8.00");
  expect(price().value).toBe("800");
  typePrice("1250");
  fireEvent.blur(price());
  expect(price().value).toBe("1.250");
});

it("refuses a negative, a decimal and anything but digits, under the field, and does not send them", async () => {
  const { api } = await open();
  openEditor("Americano");
  const said = () => within(editor()).queryByRole("alert")?.textContent ?? "";
  typePrice("-500");
  expect(price().value).toBe("-500");
  expect(said()).toBe("Harga tidak boleh negatif.");
  expect(price().getAttribute("aria-invalid")).toBe("true");
  typePrice("8,5");
  expect(said()).toBe("Isi rupiah penuh, tanpa koma atau sen. Contoh: 8.000.");
  expect(price().value).toBe("8,5");
  typePrice("8.5");
  expect(price().value).toBe("8.5");
  expect(said()).toMatch(/tanpa koma atau sen/);
  typePrice("delapan");
  expect(said()).toBe("Isi harga dengan angka saja. Contoh: 8.000.");
  typePrice("10000001");
  expect(said()).toBe("Harga paling besar Rp 10.000.000.");
  save();
  expect(api.updateDrink).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
  typePrice("8000");
  expect(said()).toBe("");
  expect(price().getAttribute("aria-invalid")).toBe("false");
});

it("sends only a price that changed: an untouched one is left to the server, a cleared one is null", async () => {
  const { api, server } = await open();
  openEditor("Americano");
  fireEvent.change(within(editor()).getByLabelText("Nama"), { target: { value: "Americano Panas" } });
  save();
  await waitFor(() => expect(api.updateDrink).toHaveBeenCalled());
  expect(api.updateDrink.mock.calls[0][1]).not.toHaveProperty("price");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(server.api.menu).toBeTruthy();
  openEditor("Americano Panas");
  typePrice("");
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.updateDrink.mock.calls[1][1]).toMatchObject({ price: null });
  expect(row("Americano Panas").textContent).toMatch(/Harga belum diisi/);
  expect(notice()?.textContent).toBe("4 minuman belum berharga: pengeluarannya tidak terhitung.");
});

it("saves a price with a new drink, and a free drink (0) is a price", async () => {
  const { api } = await open();
  fireEvent.click(screen.getByRole("button", { name: "Tambah minuman" }));
  expect(price().value).toBe("");
  fireEvent.change(within(editor()).getByLabelText("Nama"), { target: { value: "Teh Tarik" } });
  typePrice("0");
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.createDrink).toHaveBeenCalledWith(expect.objectContaining({ name: "Teh Tarik", price: 0 }));
  expect(row("Teh Tarik").textContent).toMatch(/Rp 0 ·/);
});

it("asks before leaving with a price typed, and not when it is back to what it was", async () => {
  await open();
  openEditor("Americano");
  fireEvent.click(within(editor()).getByRole("button", { name: "Tutup" }));
  expect(screen.queryByRole("dialog", { name: "Buang perubahan?" })).toBeNull();
  openEditor("Americano");
  typePrice("9000");
  fireEvent.click(within(editor()).getByRole("button", { name: "Tutup" }));
  expect(screen.getByRole("dialog", { name: "Buang perubahan?" })).toBeTruthy();
});

it("keeps the editor open with the server's words when the price is refused", async () => {
  await open({ change: () => ({ updateDrink: async () => { throw new AdminApiError("Periksa kembali isian formulir.", { price: ["Harga paling besar Rp 10.000.000."] }, 422); } }) });
  openEditor("Americano");
  typePrice("9000");
  save();
  expect(await within(editor()).findByText("Harga paling besar Rp 10.000.000.")).toBeTruthy();
  expect(row("Americano").textContent).toMatch(/Rp 8\.000/);
});

it("before migration 202612050001: no price anywhere, the field rests with the file's name, and everything else still saves", async () => {
  const { api } = await open({ menu: "prices-waiting" });
  expect(screen.getByText(/Menunggu migrasi 202612050001_coffee_price\.sql\. Sampai dijalankan, harga minuman belum bisa diisi/)).toBeTruthy();
  expect(notice()).toBeNull();
  expect(rows().some(item => /Rp |Harga belum diisi/.test(item.textContent ?? ""))).toBe(false);
  openEditor("Americano");
  expect(price().disabled).toBe(true);
  expect(price().value).toBe("");
  expect(within(editor()).getByText("Menunggu migrasi 202612050001_coffee_price.sql. Sampai dijalankan, harga belum bisa diisi.")).toBeTruthy();
  fireEvent.change(within(editor()).getByLabelText("Nama"), { target: { value: "Americano Panas" } });
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.updateDrink.mock.calls[0][1]).not.toHaveProperty("price");
  expect(row("Americano Panas")).toBeTruthy();
});

it("a refusal naming the migration (503) leaves the editor open and the list as it was", async () => {
  await open({ change: () => ({ updateDrink: async () => { throw new AdminApiError("Harga minuman menunggu migrasi 202612050001_coffee_price.sql.", undefined, 503); } }) });
  openEditor("Americano");
  typePrice("9000");
  save();
  expect((await within(editor()).findByRole("alert")).textContent).toBe("Harga minuman menunggu migrasi 202612050001_coffee_price.sql.");
  expect(row("Americano").textContent).toMatch(/Rp 8\.000/);
});
