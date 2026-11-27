import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ManualSheet } from "@/components/coffee-admin/ManualSheet";
import adminCss from "@/components/coffee-admin/coffee-admin.module.css";
import { createSampleServer } from "@/components/coffee-admin/sample";
import { PREVIEW_MENU, SAMPLE_NO_PHOTO } from "@/lib/coffee/fixtures";
import { ALL_OPTIONS, DEFAULT_OPTIONS, DRINKS, LEGACY_OPTIONS, MACHINE_MENU, MONTHLY_QUOTA, type Drink } from "@/lib/coffee/menu";
import type { CoffeeMe } from "@/lib/coffee/types";
import { DrinkPhoto } from "./CurrentOrder";
import { MenuScreen } from "./MenuScreen";
import { GuestBook } from "./ga/GuestBook";
import { Photo } from "./ga/parts";
import { QuickInput } from "./ga/QuickInput";
import { SAMPLE_PEOPLE, createSampleGa } from "./ga/sample";
import type { Draft, Line } from "./ga/model";
import { forget, NOW, rest } from "./ga/testing";
import { createSampleCoffee } from "./sample";

/*
 * F7 (27 Nov 2026): where a drink shows. The employee app lists "Menu biasa"; the tablet's quick
 * input lists "Buku tamu" for a guest and "Menu biasa" for the team; the guest menu book lists
 * "Buku tamu"; Catat manual lists by the kind recorded. A drink without a photo gets a cup on its
 * kind's tint everywhere. Made-up people only.
 */
const me: CoffeeMe = { id: "saya", name: "Rina", group: "karyawan", quota: 4, used: 0, left: 4, month: "2026-11" };
const PIC = SAMPLE_PEOPLE[0];
const draft: Draft = { room: "Vasuki Room", spot: "vasuki", pic: { id: PIC.id, name: PIC.name } };
const tiles = () => screen.getAllByRole("button", { name: /^Tambah / }).map(button => button.getAttribute("aria-label")!.replace(/^Tambah /, ""));
const only = (menu: Drink[], change: Partial<Drink>, ...slugs: string[]) => menu.map(drink => slugs.includes(drink.slug) ? { ...drink, ...change } : drink);

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); forget(); });

function quick(menu: Drink[] = PREVIEW_MENU, first: Line[] = []) {
  let seen: Line[] = [];
  function Host() {
    const [lines, setLines] = useState<Line[]>(first);
    seen = lines;
    return <QuickInput draft={draft} lines={lines} setLines={setLines} people={SAMPLE_PEOPLE} menu={menu} options={DEFAULT_OPTIONS} sending={false} problem={null} onSend={vi.fn()} onGuest={vi.fn()} onBack={vi.fn()} />;
  }
  render(<Host />);
  rest();
  return { lines: () => seen };
}

it("the employee app lists the regular menu only, with a tab for each kind that has a drink there", () => {
  const onPick = vi.fn();
  render(<MenuScreen me={me} menu={PREVIEW_MENU} onPick={onPick} />);
  const cards = () => within(screen.getByRole("tabpanel")).getAllByRole("button").map(button => button.querySelector("strong")?.textContent);
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Kopi", "Non-kopi"]);
  expect(cards()).toEqual(["Kopi Susu", "Cappuccino", "Café Latte", "Café Mocha", "Piccolo Latte", "Matcha Espresso", "Kopi Hitam", "Americano", "Espresso"]);
  fireEvent.click(screen.getByRole("tab", { name: "Non-kopi" }));
  // Cucumber Ice and Classic Tea are in the guest book only.
  expect(cards()).toEqual(["Milk Chocolate", "Matcha Latte", "Dark Chocolate", "Contoh Teh Tarik"]);
  // The drink without a photo: a cup on its kind's tint, hidden from screen readers, and it can be picked.
  const card = screen.getByRole("button", { name: /^Contoh Teh Tarik/ });
  expect(card.querySelector("img")).toBeNull();
  const cup = card.querySelector("[data-group]")!;
  expect([cup.getAttribute("data-group"), cup.getAttribute("aria-hidden"), !!cup.querySelector("svg")]).toEqual(["non-kopi", "true", true]);
  fireEvent.click(card);
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ slug: SAMPLE_NO_PHOTO.slug }));
});

it("the employee app drops the tab of a kind that has nothing in the regular menu, and moves on from it", () => {
  const { rerender } = render(<MenuScreen me={me} menu={PREVIEW_MENU} onPick={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Non-kopi" }));
  rerender(<MenuScreen me={me} menu={PREVIEW_MENU.map(drink => drink.group === "non-kopi" ? { ...drink, regular: false } : drink)} onPick={vi.fn()} />);
  expect(screen.getAllByRole("tab").map(tab => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([["Kopi", "true"]]);
  expect(within(screen.getByRole("tabpanel")).getAllByRole("button")).toHaveLength(9);
  // A menu from before migration 202612030001 carries no ticks: every drink is listed, as before.
  rerender(<MenuScreen me={me} menu={DRINKS} onPick={vi.fn()} />);
  // (The kind picked before is remembered, and comes back with its tab.)
  expect(screen.getByRole("tab", { name: "Non-kopi" }).getAttribute("aria-selected")).toBe("true");
  expect(within(screen.getByRole("tabpanel")).getAllByRole("button")).toHaveLength(5);
  fireEvent.click(screen.getByRole("tab", { name: "Kopi" }));
  expect(within(screen.getByRole("tabpanel")).getAllByRole("button")).toHaveLength(10);
});

it("the employee's make-believe server refuses a drink that is not in the regular menu, as the real one does", async () => {
  const server = createSampleCoffee({ menu: MACHINE_MENU });
  await expect(server.api.claim({ slug: "classic-tea", temperature: null, sugar: null, ice: null, key: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" })).rejects.toMatchObject({ status: 409 });
  expect((await server.api.claim({ slug: "kopi-susu", temperature: null, sugar: null, ice: null, key: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002" })).order).toMatchObject({ slug: "kopi-susu" });
});

it("the tablet's grid follows Ketuk untuk: the guest book for a guest, the regular menu for the team, and says which", () => {
  quick();
  expect(screen.getByText("Menampilkan Buku tamu.")).toBeTruthy();
  expect(tiles()).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Non-kopi" }));
  expect(tiles()).toEqual(["Milk Chocolate", "Matcha Latte", "Dark Chocolate", "Cucumber Ice", "Classic Tea", "Contoh Teh Tarik"]);
  fireEvent.click(screen.getByRole("button", { name: "Tim · rapat" }));
  expect(screen.getByText("Menampilkan Menu biasa.")).toBeTruthy();
  expect(tiles()).toEqual(["Milk Chocolate", "Matcha Latte", "Dark Chocolate", "Contoh Teh Tarik"]);
  fireEvent.click(screen.getByRole("button", { name: "Kopi" }));
  expect(tiles()).not.toContain("Cappuccino Double Shot");
  fireEvent.click(screen.getByRole("button", { name: "Tamu" }));
  expect(tiles()).toContain("Cappuccino Double Shot");
  // The tile of the drink without a photo: the cup on its kind's tint, no broken image.
  fireEvent.click(screen.getByRole("button", { name: "Non-kopi" }));
  const tile = screen.getByRole("button", { name: "Tambah Contoh Teh Tarik" });
  expect([tile.querySelector("img"), tile.querySelector("[data-group]")?.getAttribute("data-group")]).toEqual([null, "non-kopi"]);
});

it("a kind with nothing for that audience has no tab on the tablet, and an empty menu says where it is empty", () => {
  quick(only(MACHINE_MENU, { guestBook: false }, ...MACHINE_MENU.filter(drink => drink.group === "non-kopi").map(drink => drink.slug)));
  const kinds = () => within(screen.getByRole("group", { name: "Jenis minuman" })).getAllByRole("button").map(button => button.textContent);
  expect(kinds()).toEqual(["Kopi"]);
  fireEvent.click(screen.getByRole("button", { name: "Tim · rapat" }));
  expect(kinds()).toEqual(["Kopi", "Non-kopi"]);
  cleanup();
  quick(MACHINE_MENU.map(drink => ({ ...drink, guestBook: false })));
  expect(screen.getByText("Belum ada minuman kopi di Buku tamu.")).toBeTruthy();
});

it("a row cannot be moved to an audience its drink is not offered to", () => {
  const { lines } = quick();
  fireEvent.click(screen.getByRole("button", { name: "Non-kopi" }));
  fireEvent.click(screen.getByRole("button", { name: "Tambah Classic Tea" }));
  rest();
  fireEvent.click(screen.getByRole("button", { name: /^Ubah Classic Tea/ }));
  const dialog = screen.getByRole("dialog");
  expect((within(dialog).getByRole("button", { name: "Tim · rapat" }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(dialog).getByRole("button", { name: "Tamu" }) as HTMLButtonElement).disabled).toBe(false);
  expect(within(dialog).getByText("Classic Tea hanya ada di Buku tamu, jadi hanya untuk Tamu.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Tim · rapat" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(lines()).toMatchObject([{ slug: "classic-tea", for: "tamu" }]);
});

it("the tablet's make-believe server refuses a guest's drink outside the guest book and a team member's outside the regular menu", async () => {
  const server = createSampleGa({ menu: only(MACHINE_MENU, { guestBook: false }, "americano") });
  const body = (items: object[]) => ({ room: "Vasuki Room", picId: PIC.id, key: `bbbbbbbb-bbbb-4bbb-8bbb-${String(Math.random()).slice(2, 14).padEnd(12, "0")}`, items }) as Parameters<typeof server.api.send>[0];
  const line = (who: "tamu" | "tim", slug: string) => ({ for: who, personId: who === "tim" ? SAMPLE_PEOPLE[1].id : undefined, slug, temperature: "es", sugar: "Normal", ice: "Normal", qty: 1 });
  await expect(server.api.send(body([line("tamu", "americano")]))).rejects.toMatchObject({ status: 409 });
  await expect(server.api.send(body([line("tim", "classic-tea")]))).rejects.toMatchObject({ status: 409 });
  expect((await server.api.send(body([line("tamu", "classic-tea"), line("tim", "americano")]))).order.items).toHaveLength(2);
});

it("the guest menu book shows the guest book only, a ribbon per kind that has a drink, and a cup for a drink without a photo", () => {
  const menu = [...only(MACHINE_MENU, { guestBook: false }, "americano"), { ...SAMPLE_NO_PHOTO, regular: false }, { ...SAMPLE_NO_PHOTO, slug: "contoh-khusus-karyawan", name: "Contoh Khusus Karyawan", guestBook: false }];
  render(<GuestBook room="Vasuki Room" picName={PIC.name} max={40} menu={menu} options={ALL_OPTIONS} exit={{ pin: false, check: async () => ({ ok: true }) }} onDone={vi.fn()} />);
  rest();
  fireEvent.click(screen.getByRole("button", { name: "Buka buku menu" }));
  rest();
  const ribbons = () => within(screen.getByRole("group", { name: "Bagian menu" })).getAllByRole("button").map(button => button.textContent);
  expect(ribbons()).toEqual(["Kopi", "Non-kopi"]);
  const book = screen.getByRole("region", { name: "Buku menu tamu" });
  expect(book.textContent).toContain("Cappuccino Double Shot");
  expect(book.textContent).not.toContain("Americano");
  fireEvent.click(screen.getByRole("button", { name: "Non-kopi" }));
  expect(book.textContent).toContain("Classic Tea");
  expect(book.textContent).toContain("Contoh Teh Tarik");
  expect(book.textContent).not.toContain("Contoh Khusus Karyawan");
  // The drink's own page: the cup stands in for the photo and carries the drink's name for screen readers.
  fireEvent.click(screen.getByRole("button", { name: /^Contoh Teh Tarik/ }));
  rest();
  const picture = screen.getByRole("img", { name: "Contoh Teh Tarik" });
  expect([picture.tagName, picture.getAttribute("data-group")]).toEqual(["SPAN", "non-kopi"]);
});

it("the guest book loses the ribbon of a kind that has no guest-book drink", () => {
  render(<GuestBook room="Vasuki Room" picName={PIC.name} max={40} menu={MACHINE_MENU.map(drink => drink.group === "non-kopi" ? { ...drink, guestBook: false } : drink)} options={ALL_OPTIONS} exit={{ pin: false, check: async () => ({ ok: true }) }} onDone={vi.fn()} />);
  rest();
  fireEvent.click(screen.getByRole("button", { name: "Buka buku menu" }));
  rest();
  expect(within(screen.getByRole("group", { name: "Bagian menu" })).getAllByRole("button").map(button => button.textContent)).toEqual(["Kopi"]);
});

it("Catat manual lists the drinks of the kind recorded: the regular menu for a claim and the team, the guest book for a guest", () => {
  const server = createSampleServer();
  const menu = only(MACHINE_MENU, { guestBook: false }, "americano");
  render(<div className={adminCss.root}><ManualSheet api={server.api} now={Date.parse(NOW)} actorName="Dewi" settings={{ ...MONTHLY_QUOTA }} menu={menu} options={LEGACY_OPTIONS} onClose={vi.fn()} onSaved={vi.fn()} /></div>);
  const drinks = () => [...(screen.getByLabelText("Minuman") as HTMLSelectElement).options].map(option => option.textContent);
  expect(drinks()).toHaveLength(13);
  expect(drinks()).toContain("Americano");
  expect(drinks()).not.toContain("Classic Tea");
  expect(drinks().at(-1)).toBe("Lainnya (tulis sendiri)");
  expect(screen.getByText("Daftar Menu biasa. Minuman lain: pilih Lainnya.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Minuman"), { target: { value: "americano" } });
  fireEvent.click(screen.getByRole("radio", { name: "Tamu" }));
  expect(screen.getByText("Daftar Buku tamu. Minuman lain: pilih Lainnya.")).toBeTruthy();
  expect(drinks()).toHaveLength(15);
  expect(drinks()).toContain("Classic Tea");
  expect(drinks()).not.toContain("Americano");
  // The drink picked for a claim is not in the guest book: the first drink of that list takes its place.
  expect((screen.getByLabelText("Minuman") as HTMLSelectElement).value).toBe("kopi-susu");
  fireEvent.click(screen.getByRole("radio", { name: "Tim · rapat" }));
  expect(drinks()).toHaveLength(13);
});

it("a photo that does not load becomes the cup: in the employee app and on the tablet", () => {
  const { container } = render(<><DrinkPhoto src="/coffee/drinks/hilang.jpg" size={64} group="kopi" /><Photo src="/coffee/drinks/hilang.jpg" width={64} height={64} group="non-kopi" alt="Teh" /><DrinkPhoto src={null} size={48} /></>);
  expect(container.querySelectorAll("img")).toHaveLength(2);
  for (const image of container.querySelectorAll("img")) fireEvent.error(image);
  expect(container.querySelectorAll("img")).toHaveLength(0);
  const cups = [...container.querySelectorAll("span")].filter(span => span.querySelector(":scope > svg"));
  expect(cups.map(cup => [cup.getAttribute("data-group"), cup.getAttribute("aria-hidden"), cup.getAttribute("aria-label")])).toEqual([["kopi", "true", null], ["non-kopi", null, "Teh"], [null, "true", null]]);
});
