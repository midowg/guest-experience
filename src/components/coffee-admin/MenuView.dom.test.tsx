import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminApiError } from "@/components/admin/shared/api";
import { coffeeAdminPath } from "@/lib/routes";
import { CoffeeAdminApp } from "./CoffeeAdminApp";
import { MenuView } from "./MenuView";
import { SAMPLE_ACTOR, createSampleServer, type SampleMenu, type SampleServer } from "./sample";
import { coffeeAdminSections } from "./sections";
import css from "./coffee-admin.module.css";

/*
 * Menu (F6) on the make-believe server: the list, the filters, add, change, the photo, the order,
 * hide and show, and delete (refused for a drink that was ordered). Made-up people only.
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
const list = () => within(screen.getByRole("region", { name: "Daftar minuman" })).getByRole("list");
const rows = () => within(list()).getAllByRole("listitem");
const names = () => rows().map(row => row.querySelector("strong")?.textContent);
const row = (name: string) => rows().find(item => item.querySelector("strong")?.textContent === name)!;
const chip = (name: RegExp) => within(screen.getByRole("group", { name: "Saring minuman" })).getByRole("button", { name });
const editor = () => screen.getByRole("dialog");
const type = (label: string | RegExp, value: string) => fireEvent.change(within(editor()).getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(within(editor()).getByRole("button", { name: /^Simpan$/ }));
const photo = (name = "teh.png", kind = "image/png", size = 1200) => new File([new Uint8Array(size)], name, { type: kind });
const choose = (file: File) => fireEvent.change(editor().querySelector('input[type="file"]')!, { target: { files: [file] } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubGlobal("scrollTo", vi.fn());
  URL.createObjectURL = vi.fn((file: Blob) => `blob:contoh/${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("lists every drink in the menu's order: photo, name, what it is, the group and what it comes in, shown or hidden", async () => {
  await open();
  expect(screen.getByRole("heading", { level: 1, name: "Menu" })).toBeTruthy();
  expect(rows()).toHaveLength(15);
  expect(names().slice(0, 3)).toEqual(["Kopi Susu", "Cappuccino", "Café Latte"]);
  const first = row("Kopi Susu");
  expect(first.querySelector("img")?.getAttribute("src")).toMatch(/kopi-susu\.jpg$/);
  expect(first.textContent).toMatch(/Kopi hitam dicampur susu, lembut dan manis\./);
  expect(first.textContent).toMatch(/Kopi · Panas dan Es · \d+ pesanan/);
  expect(within(first).getByText("Tampil")).toBeTruthy();
  expect(row("Espresso").textContent).toMatch(/Kopi · Panas/);
  expect(row("Cucumber Ice").textContent).toMatch(/Non-kopi · Es/);
  // The first cannot go up, the last cannot go down; every control says which drink it is for.
  expect((within(first).getByRole("button", { name: "Naikkan Kopi Susu" }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(row("Classic Tea")).getByRole("button", { name: "Turunkan Classic Tea" }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(first).getByRole("button", { name: "Sembunyikan Kopi Susu" })).toBeTruthy();
  expect(within(first).getByRole("button", { name: "Ubah Kopi Susu" })).toBeTruthy();
});

it("filters by kind and by hidden, with the number of each on its chip", async () => {
  const { server } = await open();
  expect([chip(/^Semua/).textContent, chip(/^Kopi/).textContent, chip(/^Non-kopi/).textContent, chip(/^Tersembunyi/).textContent]).toEqual(["Semua15", "Kopi10", "Non-kopi5", "Tersembunyi0"]);
  fireEvent.click(chip(/^Non-kopi/));
  expect(names()).toEqual(["Milk Chocolate", "Matcha Latte", "Dark Chocolate", "Cucumber Ice", "Classic Tea"]);
  expect(chip(/^Non-kopi/).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(chip(/^Tersembunyi/));
  expect(screen.getByRole("heading", { name: "Tidak ada yang disembunyikan" })).toBeTruthy();
  expect(server.menu).toHaveLength(15);
});

it("adds a drink from the side panel: the name is asked for, the rest has a sensible start, and it joins the end of the list", async () => {
  const { api, said, server } = await open();
  fireEvent.click(screen.getByRole("button", { name: "Tambah minuman" }));
  expect(within(editor()).getByRole("heading", { name: "Tambah minuman" })).toBeTruthy();
  expect(document.activeElement).toBe(within(editor()).getByLabelText("Nama"));
  save();
  expect(within(editor()).getByText("Tulis nama minumannya.")).toBeTruthy();
  expect(api.createDrink).not.toHaveBeenCalled();
  type("Nama", "Teh Tarik");
  type(/^Keterangan/, "Teh susu yang ditarik.");
  fireEvent.click(within(editor()).getByRole("radio", { name: "Non-kopi" }));
  fireEvent.click(within(editor()).getByRole("checkbox", { name: "Es" }));
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.createDrink).toHaveBeenCalledWith({ name: "Teh Tarik", description: "Teh susu yang ditarik.", group: "non-kopi", temperatures: ["panas"], active: true, guestBook: true, regular: true });
  expect(api.uploadDrinkPhoto).not.toHaveBeenCalled();
  expect(names().at(-1)).toBe("Teh Tarik");
  expect(row("Teh Tarik").querySelector("img")).toBeNull();
  expect(row("Teh Tarik").textContent).toMatch(/Non-kopi · Panas/);
  expect(said).toHaveBeenCalledWith("success", "Teh Tarik ditambahkan ke menu.");
  expect(server.menu.at(-1)).toMatchObject({ slug: "teh-tarik", active: true });
});

it("needs at least one of Panas and Es, and shows the server's own words under the field", async () => {
  const { api } = await open({ change: real => ({ createDrink: vi.fn(async body => { if (body.name === "Sudah Ada") throw new AdminApiError("Periksa kembali isian formulir.", { name: ["Nama ini sudah dipakai."] }, 422); return real.createDrink(body); }) }) });
  fireEvent.click(screen.getByRole("button", { name: "Tambah minuman" }));
  type("Nama", "Sudah Ada");
  fireEvent.click(within(editor()).getByRole("checkbox", { name: "Panas" }));
  fireEvent.click(within(editor()).getByRole("checkbox", { name: "Es" }));
  save();
  expect(within(editor()).getByText("Pilih Panas, Es, atau keduanya.")).toBeTruthy();
  expect(api.createDrink).not.toHaveBeenCalled();
  fireEvent.click(within(editor()).getByRole("checkbox", { name: "Es" }));
  save();
  expect(await within(editor()).findByText("Nama ini sudah dipakai.")).toBeTruthy();
  expect(within(editor()).getByRole("alert").textContent).toBe("Periksa kembali isian formulir.");
  expect(within(editor()).getByLabelText("Nama").getAttribute("aria-invalid")).toBe("true");
});

it("changes a drink in place: the row opens the panel with what it has, and the list shows the new name at once", async () => {
  const { api, said } = await open();
  fireEvent.click(within(row("Café Latte")).getByRole("button", { name: "Ubah Café Latte" }));
  expect(within(editor()).getByRole("heading", { name: "Ubah Café Latte" })).toBeTruthy();
  expect((within(editor()).getByLabelText("Nama") as HTMLInputElement).value).toBe("Café Latte");
  expect((within(editor()).getByRole("radio", { name: "Kopi" }) as HTMLInputElement).checked).toBe(true);
  expect((within(editor()).getByRole("switch", { name: /^Tampil di menu/ }) as HTMLInputElement).checked).toBe(true);
  type("Nama", "Latte Susu");
  fireEvent.click(within(editor()).getByRole("switch", { name: /^Tampil di menu/ }));
  expect(within(editor()).getByText("Tersembunyi: tidak bisa dipesan, riwayatnya tetap ada.")).toBeTruthy();
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.updateDrink).toHaveBeenCalledWith("cafe-latte", expect.objectContaining({ name: "Latte Susu", active: false, temperatures: ["panas", "es"] }));
  expect(names()[2]).toBe("Latte Susu");
  expect(within(row("Latte Susu")).getByText("Tersembunyi")).toBeTruthy();
  expect(said).toHaveBeenCalledWith("success", "Latte Susu disimpan.");
  expect(chip(/^Tersembunyi/).textContent).toBe("Tersembunyi1");
});

it("asks before throwing typed changes away, and closes at once when nothing was changed", async () => {
  await open();
  fireEvent.click(within(row("Espresso")).getByRole("button", { name: "Ubah Espresso" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(within(row("Espresso")).getByRole("button", { name: "Ubah Espresso" }));
  type("Nama", "Espresso Ganda");
  fireEvent.click(within(editor()).getByRole("button", { name: "Batal" }));
  const question = screen.getByRole("dialog", { name: "Buang perubahan?" });
  fireEvent.click(within(question).getByRole("button", { name: "Lanjut mengisi" }));
  expect((within(editor()).getByLabelText("Nama") as HTMLInputElement).value).toBe("Espresso Ganda");
  fireEvent.click(within(editor()).getByRole("button", { name: "Tutup" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Buang perubahan?" })).getByRole("button", { name: "Buang perubahan" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(names()).toContain("Espresso");
});

it("changes a drink's photo: previewed at once, sent after the drink, and shown in the list", async () => {
  const { api, said } = await open();
  fireEvent.click(within(row("Kopi Susu")).getByRole("button", { name: "Ubah Kopi Susu" }));
  expect(within(editor()).getByRole("button", { name: "Ganti foto" })).toBeTruthy();
  expect(within(editor()).getByText("JPG, PNG, atau WebP, paling besar 5 MB. Dipotong persegi di tengah.")).toBeTruthy();
  expect(editor().querySelector('input[type="file"]')?.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
  choose(photo("kopi-baru.png"));
  expect(await within(editor()).findByText("kopi-baru.png dipilih. Tersimpan bersama minumannya.")).toBeTruthy();
  expect(editor().querySelector("img")?.getAttribute("src")).toBe("blob:contoh/kopi-baru.png");
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // Only the photo changed: the drink itself is not sent again.
  expect(api.updateDrink).not.toHaveBeenCalled();
  expect(api.uploadDrinkPhoto).toHaveBeenCalledTimes(1);
  expect(api.uploadDrinkPhoto.mock.calls[0][0]).toBe("kopi-susu");
  expect((api.uploadDrinkPhoto.mock.calls[0][1] as File).name).toBe("kopi-baru.png");
  expect(row("Kopi Susu").querySelector("img")?.getAttribute("src")).toBe("blob:contoh/kopi-baru.png");
  expect(said).toHaveBeenCalledWith("success", "Foto Kopi Susu diganti.");
});

it("holds back a file that is not a photo or is too big, before anything is sent", async () => {
  const { api } = await open();
  fireEvent.click(screen.getByRole("button", { name: "Tambah minuman" }));
  choose(photo("gambar.svg", "image/svg+xml"));
  expect(within(editor()).getByRole("alert").textContent).toBe("Format foto tidak dikenali. Pakai JPG, PNG, atau WebP.");
  choose(photo("besar.jpg", "image/jpeg", 5 * 1024 * 1024 + 1));
  expect(within(editor()).getByRole("alert").textContent).toBe("Ukuran foto paling besar 5 MB. Pilih yang lebih kecil.");
  expect(editor().querySelector("img")).toBeNull();
  choose(photo("teh.webp", "image/webp"));
  expect(within(editor()).queryByRole("alert")).toBeNull();
  type("Nama", "Teh Tarik");
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.createDrink).toHaveBeenCalledTimes(1);
  expect(api.uploadDrinkPhoto.mock.calls[0][0]).toBe("teh-tarik");
  expect(row("Teh Tarik").querySelector("img")?.getAttribute("src")).toBe("blob:contoh/teh.webp");
});

it("keeps the panel when the drink was saved but its photo was refused, and only sends the photo on the next try", async () => {
  let refuse = true;
  const { api } = await open({ change: real => ({ uploadDrinkPhoto: vi.fn(async (slug, file) => { if (refuse) throw new AdminApiError("Format foto tidak dikenali. Pakai JPG, PNG, atau WebP.", { photo: ["Format foto tidak dikenali. Pakai JPG, PNG, atau WebP."] }, 415); return real.uploadDrinkPhoto(slug, file); }) }) });
  fireEvent.click(screen.getByRole("button", { name: "Tambah minuman" }));
  type("Nama", "Wedang Jahe");
  choose(photo("jahe.png"));
  save();
  expect((await within(editor()).findAllByRole("alert")).map(item => item.textContent)).toContain("Wedang Jahe sudah tersimpan, tetapi fotonya belum. Format foto tidak dikenali. Pakai JPG, PNG, atau WebP.");
  expect(within(editor()).getByRole("heading", { name: "Ubah Wedang Jahe" })).toBeTruthy();
  refuse = false;
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.createDrink).toHaveBeenCalledTimes(1);
  expect(api.updateDrink).not.toHaveBeenCalled();
  expect(api.uploadDrinkPhoto).toHaveBeenCalledTimes(2);
  expect(names().filter(name => name === "Wedang Jahe")).toHaveLength(1);
});

it("moves a drink up and down at once, sends the whole order, and puts it back when the server refuses", async () => {
  const { api, said, server } = await open();
  fireEvent.click(within(row("Cappuccino")).getByRole("button", { name: "Naikkan Cappuccino" }));
  expect(names().slice(0, 3)).toEqual(["Cappuccino", "Kopi Susu", "Café Latte"]);
  await waitFor(() => expect(api.sortDrinks).toHaveBeenCalledTimes(1));
  expect((api.sortDrinks.mock.calls[0][0] as string[]).slice(0, 3)).toEqual(["cappuccino", "kopi-susu", "cafe-latte"]);
  expect(api.sortDrinks.mock.calls[0][0]).toHaveLength(15);
  await waitFor(() => expect(server.menu[0].slug).toBe("cappuccino"));
  // With a filter on, the neighbour is the next drink of that kind.
  fireEvent.click(chip(/^Non-kopi/));
  fireEvent.click(within(row("Milk Chocolate")).getByRole("button", { name: "Turunkan Milk Chocolate" }));
  expect(names().slice(0, 2)).toEqual(["Matcha Latte", "Milk Chocolate"]);
  await waitFor(() => expect(api.sortDrinks).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(server.menu.map(drink => drink.slug).slice(10, 12)).toEqual(["matcha-latte", "milk-chocolate"]));
  // Refused: the list goes back to what the server has, with the reason.
  api.sortDrinks.mockImplementationOnce(async () => { throw new AdminApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi."); });
  fireEvent.click(within(row("Classic Tea")).getByRole("button", { name: "Naikkan Classic Tea" }));
  expect(names().slice(-2)).toEqual(["Classic Tea", "Cucumber Ice"]);
  await waitFor(() => expect(said).toHaveBeenCalledWith("error", "Urutan belum tersimpan", "Tidak dapat terhubung. Periksa jaringan lalu coba lagi."));
  expect(names().slice(-2)).toEqual(["Cucumber Ice", "Classic Tea"]);
});

it("sends only the newest order when the arrows are pressed faster than the server answers", async () => {
  const answers: (() => void)[] = [];
  const { api } = await open({ change: real => ({ sortDrinks: vi.fn((slugs: string[]) => new Promise(resolve => { answers.push(() => resolve(real.sortDrinks(slugs))); })) as never }) });
  const down = () => fireEvent.click(within(row("Kopi Susu")).getByRole("button", { name: "Turunkan Kopi Susu" }));
  down(); down(); down();
  expect(names().slice(0, 4)).toEqual(["Cappuccino", "Café Latte", "Café Mocha", "Kopi Susu"]);
  expect(api.sortDrinks).toHaveBeenCalledTimes(1);
  await act(async () => { answers[0](); });
  await waitFor(() => expect(api.sortDrinks).toHaveBeenCalledTimes(2));
  expect((api.sortDrinks.mock.calls[1][0] as string[]).slice(0, 4)).toEqual(["cappuccino", "cafe-latte", "cafe-mocha", "kopi-susu"]);
  await act(async () => { answers[1](); });
  expect(names().slice(0, 4)).toEqual(["Cappuccino", "Café Latte", "Café Mocha", "Kopi Susu"]);
});

it("hides and shows a drink from its row at once, and takes it back when the server refuses", async () => {
  const { api, said, server } = await open();
  fireEvent.click(within(row("Americano")).getByRole("button", { name: "Sembunyikan Americano" }));
  expect(within(row("Americano")).getByText("Tersembunyi")).toBeTruthy();
  await waitFor(() => expect(said).toHaveBeenCalledWith("success", "Disembunyikan", "Americano tidak bisa dipesan; riwayatnya tetap ada."));
  expect(api.showDrink).toHaveBeenCalledWith("americano", false);
  expect(server.menu.find(drink => drink.slug === "americano")?.active).toBe(false);
  fireEvent.click(chip(/^Tersembunyi/));
  expect(names()).toEqual(["Americano"]);
  fireEvent.click(within(row("Americano")).getByRole("button", { name: "Tampilkan Americano" }));
  await waitFor(() => expect(said).toHaveBeenCalledWith("success", "Ditampilkan lagi", "Americano bisa dipesan lagi."));
  fireEvent.click(chip(/^Semua/));
  api.showDrink.mockImplementationOnce(async () => { throw new AdminApiError("Fitur ini menunggu migrasi 202612020001_coffee_menu.sql.", undefined, 503); });
  fireEvent.click(within(row("Espresso")).getByRole("button", { name: "Sembunyikan Espresso" }));
  await waitFor(() => expect(said).toHaveBeenCalledWith("error", "Belum bisa disembunyikan", "Fitur ini menunggu migrasi 202612020001_coffee_menu.sql."));
  expect(within(row("Espresso")).getByText("Tampil")).toBeTruthy();
});

it("offers Hapus only for a drink that was never ordered, asks first, and says why the others can only be hidden", async () => {
  const { api, said, server } = await open();
  // Café Latte waits in the queue: it was ordered.
  fireEvent.click(within(row("Café Latte")).getByRole("button", { name: "Ubah Café Latte" }));
  expect(within(editor()).queryByRole("button", { name: "Hapus minuman" })).toBeNull();
  expect(within(editor()).getByText(/^Sudah dipesan \d+ kali, jadi tidak bisa dihapus \(riwayat dan rekap memakainya\)\. Sembunyikan saja/)).toBeTruthy();
  fireEvent.click(within(editor()).getByRole("button", { name: "Batal" }));
  // A new drink nobody ordered yet may go.
  await act(async () => { await server.api.createDrink({ name: "Teh Tarik", description: "", group: "non-kopi", temperatures: ["panas"], active: true, guestBook: true, regular: true }); });
  cleanup();
  render(<div className={css.root}><MenuView api={api} initial={await server.api.menu()} active onSaid={said} /></div>);
  fireEvent.click(within(row("Teh Tarik")).getByRole("button", { name: "Ubah Teh Tarik" }));
  expect(within(editor()).getByText("Belum pernah dipesan, jadi boleh dihapus.")).toBeTruthy();
  fireEvent.click(within(editor()).getByRole("button", { name: "Hapus minuman" }));
  const question = screen.getByRole("dialog", { name: "Hapus Teh Tarik?" });
  expect(question.textContent).toMatch(/tidak bisa dikembalikan/);
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Kembali" }));
  fireEvent.click(within(question).getByRole("button", { name: "Kembali" }));
  expect(api.deleteDrink).not.toHaveBeenCalled();
  fireEvent.click(within(editor()).getByRole("button", { name: "Hapus minuman" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Hapus Teh Tarik?" })).getByRole("button", { name: "Hapus minuman" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.deleteDrink).toHaveBeenCalledWith("teh-tarik");
  expect(names()).not.toContain("Teh Tarik");
  expect(said).toHaveBeenCalledWith("success", "Minuman dihapus dari menu.", "Teh Tarik tidak lagi ada di menu.");
});

it("shows the server's refusal when the drink was ordered while its panel was open", async () => {
  const { api, server } = await open();
  await act(async () => { await server.api.createDrink({ name: "Teh Tarik", description: "", group: "non-kopi", temperatures: ["panas"], active: true, guestBook: true, regular: true }); });
  cleanup();
  render(<div className={css.root}><MenuView api={api} initial={await server.api.menu()} active onSaid={vi.fn()} /></div>);
  fireEvent.click(within(row("Teh Tarik")).getByRole("button", { name: "Ubah Teh Tarik" }));
  // Someone orders it meanwhile (Catat manual).
  await server.api.manual({ kind: "klaim", employeeId: "p-raka", date: "2026-11-25", time: "09:00", slug: "teh-tarik", key: "eeeeeeee-eeee-4eee-8eee-000000000009" });
  fireEvent.click(within(editor()).getByRole("button", { name: "Hapus minuman" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Hapus Teh Tarik?" })).getByRole("button", { name: "Hapus minuman" }));
  expect((await within(editor()).findByRole("alert")).textContent).toBe("Minuman ini sudah pernah dipesan, jadi tidak bisa dihapus. Sembunyikan saja supaya tidak bisa dipesan lagi.");
  expect(names()).toContain("Teh Tarik");
});

it("before migration 202612020001 shows the code's menu to look at only, and says what it waits for", async () => {
  const { api } = await open({ menu: "waiting" });
  expect(screen.getByRole("status").textContent).toBe("Menunggu migrasi 202612020001_coffee_menu.sql. Sampai dijalankan, menu memakai 15 minuman bawaan dan belum bisa diubah.");
  expect(rows()).toHaveLength(15);
  expect(screen.queryByRole("button", { name: "Tambah minuman" })).toBeNull();
  expect(within(list()).queryByRole("button", { name: /^(Naikkan|Turunkan|Sembunyikan)/ })).toBeNull();
  expect((within(row("Kopi Susu")).getByRole("button", { name: "Ubah Kopi Susu" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(row("Kopi Susu")).getByRole("button", { name: "Ubah Kopi Susu" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.createDrink).not.toHaveBeenCalled();
});

it("invites to add the first drink when the menu is empty", async () => {
  await open({ menu: "empty" });
  expect(screen.getByRole("heading", { name: "Menu masih kosong" })).toBeTruthy();
  expect(screen.getByText("Tambah minuman pertama supaya bisa dipesan.")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Tambah minuman" })).toHaveLength(2);
});

it("reads the menu again each time the section is opened, keeps what it has when that fails, and offers to try again", async () => {
  const server = createSampleServer(() => Date.parse(NOW));
  const menu = vi.fn(server.api.menu);
  const api = { ...server.api, menu };
  const view = (active: boolean) => <div className={css.root}><MenuView api={api} initial={undefined} active={active} onSaid={vi.fn()} /></div>;
  const drawn = render(view(true));
  expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  await waitFor(() => expect(rows()).toHaveLength(15));
  expect(menu).toHaveBeenCalledTimes(1);
  drawn.rerender(view(false));
  await server.api.showDrink("espresso", false);
  drawn.rerender(view(true));
  await waitFor(() => expect(within(row("Espresso")).getByText("Tersembunyi")).toBeTruthy());
  expect(menu).toHaveBeenCalledTimes(2);
  menu.mockImplementationOnce(async () => { throw new AdminApiError("Tidak dapat terhubung."); });
  drawn.rerender(view(false));
  drawn.rerender(view(true));
  expect((await screen.findByRole("status")).textContent).toMatch(/Menu belum bisa diperbarui\. Yang tampil mungkin sudah berubah\./);
  expect(rows()).toHaveLength(15);
  fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(menu).toHaveBeenCalledTimes(4);
});

// The whole screen: four sections, the same on the desktop menu and the phone's bottom menu.
it("is the third of four sections, with the same four in the phone's bottom menu, and opens without a page load", async () => {
  const server = createSampleServer(() => Date.parse(NOW));
  const api = { ...server.api, menu: vi.fn(server.api.menu) };
  render(<CoffeeAdminApp view="antrean" initial={{ queue: await server.api.queue() }} now={NOW} personName={SAMPLE_ACTOR.name} api={api} routing="memory" />);
  const phone = within(screen.getByRole("navigation", { name: "Menu pengelola (ponsel)" })).getAllByRole("link");
  expect(phone.map(link => link.textContent?.replace(/\d+ pesanan menunggu/, ""))).toEqual(["Antrean", "Rekap", "Menu", "Pengaturan"]);
  expect(phone.map(link => link.getAttribute("href"))).toEqual(coffeeAdminSections.map(section => section.href));
  expect(phone[2].getAttribute("href")).toBe(coffeeAdminPath.menu);
  expect(api.menu).not.toHaveBeenCalled();
  fireEvent.click(phone[2]);
  expect(await screen.findByRole("heading", { level: 1, name: "Menu" })).toBeTruthy();
  await waitFor(() => expect(rows()).toHaveLength(15));
  expect(api.menu).toHaveBeenCalledTimes(1);
  expect(phone[2].getAttribute("aria-current")).toBe("page");
  // A change made here is said in the screen's own message.
  fireEvent.click(within(row("Americano")).getByRole("button", { name: "Sembunyikan Americano" }));
  expect(await screen.findByText("Americano tidak bisa dipesan; riwayatnya tetap ada.")).toBeTruthy();
  // Back to Antrean and here again: the list is still there, and read again quietly.
  fireEvent.click(phone[0]);
  fireEvent.click(phone[2]);
  expect(rows()).toHaveLength(15);
  await waitFor(() => expect(api.menu).toHaveBeenCalledTimes(2));
});

/* ---------- F7: where a drink shows (Buku tamu, Menu biasa), the search and the new filters ---------- */

const tickOf = (drink: string, place: "Buku tamu" | "Menu biasa") => within(row(drink)).getByRole("checkbox", { name: `${place}: ${drink}` }) as HTMLInputElement;

it("F7 shows on every row where the drink shows, with the owner's starting ticks", async () => {
  await open();
  expect(within(row("Kopi Susu")).getByRole("group", { name: "Tampil di mana: Kopi Susu" })).toBeTruthy();
  expect([tickOf("Kopi Susu", "Buku tamu").checked, tickOf("Kopi Susu", "Menu biasa").checked]).toEqual([true, true]);
  for (const name of ["Cappuccino Double Shot", "Cucumber Ice", "Classic Tea"]) expect([tickOf(name, "Buku tamu").checked, tickOf(name, "Menu biasa").checked]).toEqual([true, false]);
  expect(chip(/^Buku tamu/).textContent).toBe("Buku tamu15");
  expect(chip(/^Menu biasa/).textContent).toBe("Menu biasa12");
  expect(chip(/^Tanpa foto/).textContent).toBe("Tanpa foto0");
  // The words under the list say what each tick means and how Sembunyikan relates to them.
  const notes = screen.getByRole("region", { name: "Daftar minuman" }).textContent ?? "";
  expect(notes).toMatch(/Buku tamu: tampil di buku menu tamu \(tablet GA\) dan bisa dipesankan untuk Tamu\./);
  expect(notes).toMatch(/Sembunyikan mematikan minuman di semua tempat tanpa mengubah centangnya/);
});

it("F7 ticks and unticks on the row at once, tells the server, and says what the drink is now", async () => {
  const { api, said, server } = await open();
  fireEvent.click(tickOf("Classic Tea", "Menu biasa"));
  expect(tickOf("Classic Tea", "Menu biasa").checked).toBe(true);
  await waitFor(() => expect(said).toHaveBeenCalledWith("success", "Masuk Menu biasa", "Classic Tea kini tampil di Buku tamu dan Menu biasa."));
  expect(api.placeDrink).toHaveBeenCalledWith("classic-tea", "regular", true);
  expect(server.menu.find(drink => drink.slug === "classic-tea")).toMatchObject({ guestBook: true, regular: true });
  fireEvent.click(tickOf("Classic Tea", "Buku tamu"));
  await waitFor(() => expect(said).toHaveBeenCalledWith("success", "Keluar dari Buku tamu", "Classic Tea kini hanya tampil di Menu biasa."));
  fireEvent.click(tickOf("Classic Tea", "Menu biasa"));
  await waitFor(() => expect(said).toHaveBeenCalledWith("success", "Keluar dari Menu biasa", "Classic Tea kini tidak tampil di menu mana pun."));
  // Shown, but in no menu: the row says so instead of "Tampil".
  expect(within(row("Classic Tea")).getByText("Tanpa menu")).toBeTruthy();
  expect(chip(/^Menu biasa/).textContent).toBe("Menu biasa12");
  expect(chip(/^Buku tamu/).textContent).toBe("Buku tamu14");
});

it("F7 puts the tick back and says why when the server refuses; a second press waits for the first", async () => {
  let release: (value?: unknown) => void = () => {};
  const { api, said } = await open({ change: real => ({ placeDrink: vi.fn(async (slug, place, on) => { await new Promise(resolve => { release = resolve; }); if (slug === "kopi-susu") throw new AdminApiError("Server belum dapat memberikan jawaban.", undefined, 503); return real.placeDrink(slug, place, on); }) }) });
  fireEvent.click(tickOf("Kopi Susu", "Buku tamu"));
  expect(tickOf("Kopi Susu", "Buku tamu").checked).toBe(false);
  expect(tickOf("Kopi Susu", "Buku tamu").getAttribute("aria-busy")).toBe("true");
  fireEvent.click(tickOf("Kopi Susu", "Buku tamu"));
  expect(api.placeDrink).toHaveBeenCalledTimes(1);
  // The other tick of the same drink is its own: it can be sent meanwhile.
  await act(async () => { release(); });
  await waitFor(() => expect(said).toHaveBeenCalledWith("error", "Buku tamu belum berubah", "Server belum dapat memberikan jawaban."));
  expect(tickOf("Kopi Susu", "Buku tamu").checked).toBe(true);
  expect(tickOf("Kopi Susu", "Buku tamu").getAttribute("aria-busy")).toBeNull();
});

it("F7 finds a drink by name and by chip, counts what is shown, and offers the way back when nothing fits", async () => {
  await open();
  const search = screen.getByRole("searchbox", { name: "Cari minuman" });
  fireEvent.change(search, { target: { value: "  LATTE " } });
  expect(names()).toEqual(["Café Latte", "Piccolo Latte", "Matcha Latte"]);
  expect(screen.getByText("3 dari 15 minuman")).toBeTruthy();
  fireEvent.click(chip(/^Non-kopi/));
  expect(names()).toEqual(["Matcha Latte"]);
  fireEvent.click(screen.getByRole("button", { name: "Hapus pencarian" }));
  expect(names()).toHaveLength(5);
  fireEvent.click(chip(/^Menu biasa/));
  expect(names()).toHaveLength(12);
  expect(names()).not.toContain("Classic Tea");
  fireEvent.click(chip(/^Buku tamu/));
  expect(names()).toHaveLength(15);
  fireEvent.click(chip(/^Tanpa foto/));
  expect(screen.getByRole("heading", { name: "Semua minuman sudah punya foto" })).toBeTruthy();
  fireEvent.click(chip(/^Semua/));
  fireEvent.change(search, { target: { value: "wedang" } });
  expect(screen.getByRole("heading", { name: "Tidak ada minuman bernama “wedang”" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tampilkan semua minuman" }));
  expect(names()).toHaveLength(15);
  expect((search as HTMLInputElement).value).toBe("");
});

it("F7 a long menu stays usable: 63 drinks, the ones without a photo get a cup on their kind's tint, and the search narrows them", async () => {
  await open({ menu: "many" });
  expect(rows()).toHaveLength(63);
  expect(chip(/^Tanpa foto/).textContent).toBe("Tanpa foto48");
  fireEvent.click(chip(/^Tanpa foto/));
  expect(rows()).toHaveLength(48);
  const first = row("Contoh Minuman 1");
  expect(first.querySelector("img")).toBeNull();
  const cup = first.querySelector("[data-empty]")!;
  expect([cup.getAttribute("data-group"), cup.getAttribute("aria-hidden"), !!cup.querySelector("svg")]).toEqual(["kopi", "true", true]);
  expect(row("Contoh Minuman 3").querySelector("[data-empty]")?.getAttribute("data-group")).toBe("non-kopi");
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari minuman" }), { target: { value: "minuman 4" } });
  expect(names()).toEqual(["Contoh Minuman 4", ...Array.from({ length: 9 }, (_, index) => `Contoh Minuman 4${index}`)]);
});

it("F7 a photo that does not load is replaced by the cup, never left broken", async () => {
  await open();
  const picture = row("Kopi Susu").querySelector("img")!;
  fireEvent.error(picture);
  expect(row("Kopi Susu").querySelector("img")).toBeNull();
  expect(row("Kopi Susu").querySelector("[data-empty]")?.getAttribute("data-group")).toBe("kopi");
});

it("F7 the editor holds both ticks: a new drink starts in both, and what is unticked is saved", async () => {
  const { api } = await open();
  fireEvent.click(screen.getByRole("button", { name: "Tambah minuman" }));
  const group = within(editor()).getByRole("group", { name: "Masuk menu mana" });
  const [book, regular] = within(group).getAllByRole("checkbox") as HTMLInputElement[];
  expect([book.checked, regular.checked]).toEqual([true, true]);
  expect(within(group).getByText("Buku menu tamu di tablet GA, dan pesanan untuk Tamu.")).toBeTruthy();
  type("Nama", "Teh Tarik");
  fireEvent.click(book);
  save();
  await waitFor(() => expect(api.createDrink).toHaveBeenCalledWith({ name: "Teh Tarik", description: "", group: "kopi", temperatures: ["panas", "es"], active: true, guestBook: false, regular: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect([tickOf("Teh Tarik", "Buku tamu").checked, tickOf("Teh Tarik", "Menu biasa").checked]).toEqual([false, true]);
  // An existing drink opens with its own ticks; unticking both says what that means.
  fireEvent.click(within(row("Classic Tea")).getByRole("button", { name: "Ubah Classic Tea" }));
  const boxes = within(within(editor()).getByRole("group", { name: "Masuk menu mana" })).getAllByRole("checkbox") as HTMLInputElement[];
  expect(boxes.map(box => box.checked)).toEqual([true, false]);
  fireEvent.click(boxes[0]);
  expect(within(editor()).getByText("Tanpa centang, minuman ini tidak tampil di mana pun. Riwayatnya tetap ada.")).toBeTruthy();
  save();
  await waitFor(() => expect(api.updateDrink).toHaveBeenCalledWith("classic-tea", expect.objectContaining({ guestBook: false, regular: false })));
});

it("F7 before migration 202612030001: every drink in both menus, the ticks rest, and the page says what waits", async () => {
  const { api } = await open({ menu: "places-waiting" });
  expect(screen.getByRole("status").textContent).toBe("Menunggu migrasi 202612030001_coffee_menu_audience.sql. Sampai dijalankan, semua minuman tampil di Buku tamu dan Menu biasa, dan centangnya belum bisa diubah.");
  expect(rows()).toHaveLength(15);
  const tick = tickOf("Classic Tea", "Menu biasa");
  expect([tick.checked, tick.disabled]).toEqual([true, true]);
  fireEvent.click(tick);
  expect(api.placeDrink).not.toHaveBeenCalled();
  // The rest of the menu still works: add, change, hide.
  expect(screen.getByRole("button", { name: "Tambah minuman" })).toBeTruthy();
  fireEvent.click(within(row("Classic Tea")).getByRole("button", { name: "Ubah Classic Tea" }));
  const group = within(editor()).getByRole("group", { name: "Masuk menu mana" }) as HTMLFieldSetElement;
  expect(group.disabled).toBe(true);
  expect(within(editor()).getByText("Menunggu migrasi: sampai dijalankan, semua minuman tampil di keduanya.")).toBeTruthy();
});
