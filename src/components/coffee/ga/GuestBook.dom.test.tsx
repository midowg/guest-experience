import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ALL_OPTIONS, DRINKS, NO_OPTIONS, type Drink, type DrinkOptions } from "@/lib/coffee/menu";
import { GaApp } from "./GaApp";
import { GuestBook } from "./GuestBook";
import type { Line } from "./model";
import { SAMPLE_GA, SAMPLE_PEOPLE, createSampleGa } from "./sample";
import { forget, NOW, rest } from "./testing";

/*
 * The guest menu book (26 Nov 2026): what a guest can see and do while holding the tablet, and that
 * only the GA officer's yes leaves it. Made-up people only.
 */
const PIC = SAMPLE_PEOPLE[0];

function open(props: { guest?: string; max?: number; options?: DrinkOptions; menu?: Drink[] } = {}) {
  const onDone = vi.fn<(lines: Line[]) => void>();
  render(<GuestBook room="Vasuki Room" picName={PIC.name} guest={"guest" in props ? props.guest : "PT Sinar Jaya (contoh)"} max={props.max ?? 40} menu={props.menu ?? DRINKS} options={props.options ?? ALL_OPTIONS} exit={{ pin: false, check: async () => ({ ok: true }) }} onDone={onDone} />);
  rest();
  return { onDone };
}
const press = (name: string | RegExp) => { fireEvent.click(screen.getByRole("button", { name })); rest(); };
/** Cover → menu → the drink's page → Pilih minuman ini. */
function pick(drink: string, name = "") {
  press(new RegExp(`^${drink}`));
  if (name) fireEvent.change(screen.getByLabelText(/^Nama Anda/), { target: { value: name } });
  press("Pilih minuman ini");
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); forget(); });

it("opens on a cover with nothing but the logo and the way in", () => {
  open();
  const book = screen.getByRole("region", { name: "Buku menu tamu" });
  expect(within(book).getAllByRole("button").map(button => button.textContent)).toEqual(["Mode GA", "Ketuk untuk membuka"]);
  expect(book.textContent).toBe("Mode GAKetuk untuk membuka");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Buka buku menu" }));
});

it("greets the guest by name, speaks of Anda, and never of quota, free drinks or employees", () => {
  open();
  press("Buka buku menu");
  expect(screen.getByText("PT Sinar Jaya (contoh)").parentElement?.textContent).toBe("Disajikan khusus untuk PT Sinar Jaya (contoh)");
  expect(screen.getByText(`Bersama ${PIC.name} · Vasuki Room`)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "Kopi" })).toBeTruthy();
  expect(screen.getByText("Silakan pilih minuman Anda. Ketuk untuk mengatur suhu dan gula.")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Non-kopi" }));
  expect(screen.getByRole("heading", { level: 2, name: "Non-kopi" })).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  press(/^Cucumber Ice/);
  expect(screen.getByText("Disajikan dingin dengan es.")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Takaran es" })).toBeTruthy();
  for (const word of [/jatah/i, /kuota/i, /gratis/i, /klaim/i, /karyawan/i, /pengelola/i, /\bkamu\b/i]) expect(document.body.textContent).not.toMatch(word);
});

it("welcomes a guest whose name GA did not write", () => {
  open({ guest: undefined });
  press("Buka buku menu");
  expect(screen.getByText("Selamat datang di Werkudara")).toBeTruthy();
});

it("takes each guest's choice with its options and the name they give, and thanks them", () => {
  const { onDone } = open();
  press("Buka buku menu");
  press(/^Café Latte/);
  expect(screen.getByRole("img", { name: "Café Latte" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Es" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Gula" })).getByRole("button", { name: "Sedikit" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Takaran es" })).getByRole("button", { name: "Ekstra" }));
  fireEvent.change(screen.getByLabelText(/^Nama Anda/), { target: { value: " Budi " } });
  press("Pilih minuman ini");
  expect(screen.getByRole("heading", { level: 2, name: "Pilihan Anda sudah kami terima" })).toBeTruthy();
  expect(screen.getByText("Terima kasih. Minuman Anda segera kami siapkan dan antar ke Vasuki Room.")).toBeTruthy();
  expect(screen.getByText("Es · gula Sedikit · es Ekstra")).toBeTruthy();
  press("Tamu berikutnya memilih");
  expect(screen.getByText("1 pilihan sudah tercatat")).toBeTruthy();
  pick("Espresso");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  // A guest who changed their mind takes their choice back.
  press("Hapus Espresso");
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  // Nothing went anywhere yet: the picks only leave with the GA officer's yes.
  expect(onDone).not.toHaveBeenCalled();
  press("Serahkan kembali ke GA");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" }));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone.mock.calls[0][0]).toMatchObject([{ for: "tamu", slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Ekstra", qty: 1, guestName: "Budi" }]);
  expect(onDone.mock.calls[0][0][0]).not.toHaveProperty("person");
});

it("does not let a double tap run through two pages", () => {
  open();
  const cover = screen.getByRole("button", { name: "Buka buku menu" });
  fireEvent.click(cover);
  // The second tap of the same press lands where the first drink now is.
  fireEvent.click(screen.getByRole("button", { name: /^Kopi Susu/ }));
  expect(screen.getByRole("heading", { level: 2, name: "Kopi" })).toBeTruthy();
  rest();
  press(/^Kopi Susu/);
  const choose = screen.getByRole("button", { name: "Pilih minuman ini" });
  fireEvent.click(choose);
  // ... and "Tamu berikutnya memilih" sits where "Pilih minuman ini" was.
  fireEvent.click(screen.getByRole("button", { name: "Tamu berikutnya memilih" }));
  expect(screen.getByRole("heading", { level: 2, name: "Pilihan Anda sudah kami terima" })).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});

it("leaves only after a yes: Tetap, Escape and a press outside all stay in the book", () => {
  const { onDone } = open();
  press("Buka buku menu");
  pick("Americano");
  press("Mode GA");
  const ask = () => screen.getByRole("alertdialog");
  expect(within(ask()).getByRole("heading", { name: "Kembali ke mode GA?" })).toBeTruthy();
  expect(within(ask()).getByText("1 pilihan tamu dimasukkan ke pesanan. Periksa lalu kirim dari layar GA. Khusus petugas GA.")).toBeTruthy();
  expect(ask().textContent).not.toMatch(/PIN/);
  // The safe answer has the focus.
  expect(document.activeElement).toBe(within(ask()).getByRole("button", { name: "Tetap di buku menu" }));
  fireEvent.click(within(ask()).getByRole("button", { name: "Tetap di buku menu" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  press("Mode GA");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  press("Mode GA");
  fireEvent.mouseDown(ask().parentElement!);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { level: 2, name: "Pilihan Anda sudah kami terima" })).toBeTruthy();
  // The yes ignores the tap that opened the question.
  fireEvent.click(screen.getByRole("button", { name: "Mode GA" }));
  fireEvent.click(within(ask()).getByRole("button", { name: "Ya, mode GA" }));
  expect(onDone).not.toHaveBeenCalled();
  rest();
  fireEvent.click(within(ask()).getByRole("button", { name: "Ya, mode GA" }));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it("stops taking choices when the order is full", () => {
  open({ max: 1 });
  press("Buka buku menu");
  pick("Americano");
  expect(screen.queryByRole("button", { name: "Tamu berikutnya memilih" })).toBeNull();
  expect(screen.getByText("Meja ini sudah penuh. Silakan serahkan kembali ke petugas kami.")).toBeTruthy();
});

it("inside the tablet: while the guest holds it, the page has no GA screen, no employee but the PIC, and asks the server nothing", () => {
  const server = createSampleGa({ seeded: true });
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send), checkPin: vi.fn(server.api.checkPin) };
  render(<GaApp initial={server.initial()} me={{ name: SAMPLE_GA }} api={api} tools={<p>kotak pratinjau</p>} />);
  rest();
  fireEvent.click(screen.getByRole("button", { name: "Pesanan baru" }));
  fireEvent.click(screen.getByRole("button", { name: "Pilih Vasuki Room" }));
  fireEvent.click(screen.getByText(PIC.name).closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: "Serahkan ke tamu" }));
  rest();
  const asked = api.state.mock.calls.length;
  press("Buka buku menu");
  expect(document.body.textContent).toContain(`Bersama ${PIC.name} · Vasuki Room`);
  pick("Kopi Hitam", "Ibu Ratna");
  const page = document.body.textContent ?? "";
  for (const other of SAMPLE_PEOPLE.filter(person => person.id !== PIC.id)) expect(page).not.toContain(other.name);
  for (const hidden of [SAMPLE_GA, "Tablet GA", "Aplikasi saya", "kotak pratinjau", "PT Sinar Jaya", "CFC Ananta Room", "Dewi", "T-0113"]) expect(page).not.toContain(hidden);
  expect(screen.queryByRole("banner")).toBeNull();
  expect(screen.queryByRole("main")).toBeNull();
  expect(api.state.mock.calls.length).toBe(asked);
  expect(api.send).not.toHaveBeenCalled();
  // Back with GA: the choice is a Tamu row with the guest's name, and nothing was sent.
  press("Serahkan kembali ke GA");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" }));
  expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Pesanan" })).getByText("Tamu · Ibu Ratna")).toBeTruthy();
  expect(api.send).not.toHaveBeenCalled();
});

/* ---------- after the F3 audit (26 Nov 2026) */

it("F3-08 a double tap on Hapus removes one choice, not the one that moved up under the finger", () => {
  open();
  press("Buka buku menu");
  pick("Americano", "Ani");
  press("Tamu berikutnya memilih");
  pick("Kopi Susu", "Budi");
  press("Tamu berikutnya memilih");
  pick("Kopi Hitam", "Cici");
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  const remove = () => screen.getAllByRole("button", { name: /^Hapus / })[0];
  fireEvent.click(remove());
  fireEvent.click(remove()); // the second tap of the same press lands on Budi's row
  expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([expect.stringMatching(/Kopi Susu.*Budi/), expect.stringMatching(/Kopi Hitam.*Cici/)]);
  rest();
  fireEvent.click(remove());
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});

it("F3-09 says the table is full instead of taking a choice that goes nowhere", () => {
  const { onDone } = open({ max: 0 });
  press("Buka buku menu");
  expect(screen.getByRole("status").textContent).toBe("Pesanan untuk meja ini sudah penuh. Silakan serahkan kembali ke petugas kami.");
  press(/^Kopi Susu/);
  expect(screen.queryByRole("button", { name: "Pilih minuman ini" })).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/sudah penuh/);
  expect(onDone).not.toHaveBeenCalled();
});

it("F3-01 hands up what the guests picked as it changes, and opens where it was left when it is given back", () => {
  const kept: unknown[] = [];
  const onDone = vi.fn<(lines: Line[]) => void>();
  const exit = { pin: false, check: async () => ({ ok: true as const }) };
  const view = render(<GuestBook room="Vasuki Room" picName={PIC.name} max={40} menu={DRINKS} options={ALL_OPTIONS} exit={exit} onKeep={book => kept.push(book)} onDone={onDone} />);
  rest();
  press("Buka buku menu");
  pick("Americano", "Ani");
  const last = kept[kept.length - 1] as { open: boolean; picks: { slug: string; name: string; id: string }[] };
  expect(last).toMatchObject({ open: true, picks: [{ slug: "americano", name: "Ani", temperature: "panas", sugar: "Normal" }] });
  expect(last.picks[0].id).toBeTruthy();
  view.unmount();
  render(<GuestBook room="Vasuki Room" picName={PIC.name} max={40} menu={DRINKS} options={ALL_OPTIONS} exit={exit} saved={last as never} onDone={onDone} />);
  rest();
  // Open on the menu, with the pick still counted.
  expect(screen.queryByRole("button", { name: "Buka buku menu" })).toBeNull();
  expect(screen.getByText("1 pilihan sudah tercatat")).toBeTruthy();
  press("Mode GA");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" }));
  expect(onDone.mock.calls[0][0]).toMatchObject([{ for: "tamu", slug: "americano", guestName: "Ani", qty: 1 }]);
});

it("F3-17 keeps the focus on the Kopi / Non-kopi tab when it is pressed", () => {
  open();
  press("Buka buku menu");
  const tab = screen.getByRole("button", { name: "Non-kopi" });
  tab.focus();
  fireEvent.click(tab);
  expect(document.activeElement).toBe(tab);
});

// F6: what a guest is asked follows Pengaturan → Opsi minuman (the "Tamu" row).
it("F6 asks a guest nothing but their name when guests are asked nothing, and writes the pick as the drink alone", () => {
  const { onDone } = open({ options: NO_OPTIONS });
  press("Buka buku menu");
  expect(screen.getByText("Silakan pilih minuman Anda.")).toBeTruthy();
  press(/^Café Latte/);
  expect(screen.getByRole("heading", { level: 3, name: "Minuman pilihan Anda" })).toBeTruthy();
  for (const name of ["Suhu", "Gula", "Takaran es"]) expect(screen.queryByRole("group", { name })).toBeNull();
  expect(screen.queryByText(/Disajikan/)).toBeNull();
  fireEvent.change(screen.getByLabelText(/^Nama Anda/), { target: { value: "Budi" } });
  press("Pilih minuman ini");
  const picked = screen.getAllByRole("listitem")[0];
  expect(picked.textContent).toMatch(/^Café LatteBudi/);
  expect(picked.textContent).not.toMatch(/Panas|gula/);
  press("Serahkan kembali ke GA");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" }));
  expect(onDone.mock.calls[0][0]).toMatchObject([{ for: "tamu", slug: "cafe-latte", temperature: null, sugar: null, ice: null, guestName: "Budi", qty: 1 }]);
});

it("F6 asks only sugar when that is all guests are asked, and shows the pengelola's menu", () => {
  const menu: Drink[] = [...DRINKS.filter(drink => drink.slug !== "espresso"), { slug: "teh-tarik", name: "Teh Tarik", description: "Teh susu.", group: "kopi", temperatures: ["panas"], photo: null, active: true }, { ...DRINKS[0], slug: "rahasia", name: "Minuman Tersembunyi", active: false }];
  const { onDone } = open({ options: { suhu: false, gula: true, es: false }, menu });
  press("Buka buku menu");
  expect(screen.getByText("Silakan pilih minuman Anda. Ketuk untuk mengatur gula.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Espresso/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Minuman Tersembunyi/ })).toBeNull();
  press(/^Teh Tarik/);
  // No photo yet: a cup that still carries the drink's name.
  expect(screen.getByRole("img", { name: "Teh Tarik" }).tagName).toBe("SPAN");
  expect(screen.queryByRole("group", { name: "Suhu" })).toBeNull();
  fireEvent.click(within(screen.getByRole("group", { name: "Gula" })).getByRole("button", { name: "Tanpa" }));
  press("Pilih minuman ini");
  expect(screen.getByText("gula Tanpa")).toBeTruthy();
  press("Serahkan kembali ke GA");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ya, mode GA" }));
  expect(onDone.mock.calls[0][0]).toMatchObject([{ slug: "teh-tarik", temperature: null, sugar: "Tanpa", ice: null }]);
});
