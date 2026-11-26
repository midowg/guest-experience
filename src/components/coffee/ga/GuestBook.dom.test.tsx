import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GaApp } from "./GaApp";
import { GuestBook } from "./GuestBook";
import type { Line } from "./model";
import { SAMPLE_GA, SAMPLE_PEOPLE, createSampleGa } from "./sample";
import { NOW, rest } from "./testing";

/*
 * The guest menu book (26 Nov 2026): what a guest can see and do while holding the tablet, and that
 * only the GA officer's yes leaves it. Made-up people only.
 */
const PIC = SAMPLE_PEOPLE[0];

function open(props: { guest?: string; max?: number } = {}) {
  const onDone = vi.fn<(lines: Line[]) => void>();
  render(<GuestBook room="Vasuki Room" picName={PIC.name} guest={"guest" in props ? props.guest : "PT Sinar Jaya (contoh)"} max={props.max ?? 40} onDone={onDone} />);
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
afterEach(() => { cleanup(); vi.useRealTimers(); });

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
  const api = { state: vi.fn(server.api.state), send: vi.fn(server.api.send) };
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
