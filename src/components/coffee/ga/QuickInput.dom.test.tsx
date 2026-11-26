import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MAX_LINES, type Draft, type Line } from "./model";
import { QuickInput } from "./QuickInput";
import { SAMPLE_PEOPLE } from "./sample";
import { NOW, rest } from "./testing";

/*
 * Input cepat alone (26 Nov 2026): taps become rows, a team member's drink needs the person, a row
 * can be changed and removed, and nothing is sent twice. Made-up people only.
 */
const PIC = SAMPLE_PEOPLE[0], OTHER = SAMPLE_PEOPLE[3];
const draft: Draft = { room: "Vasuki Room", spot: "vasuki", pic: { id: PIC.id, name: PIC.name }, guest: "PT Sinar Jaya (contoh)", guestCount: 4 };

function open(props: { sending?: boolean; problem?: string; first?: Line[] } = {}) {
  const onSend = vi.fn(), onGuest = vi.fn(), onBack = vi.fn();
  let seen: Line[] = [];
  function Host() {
    const [lines, setLines] = useState<Line[]>(props.first ?? []);
    seen = lines;
    return <QuickInput draft={draft} lines={lines} setLines={setLines} people={SAMPLE_PEOPLE} sending={props.sending ?? false} problem={props.problem ?? null} onSend={onSend} onGuest={onGuest} onBack={onBack} />;
  }
  render(<Host />);
  rest();
  return { onSend, onGuest, onBack, lines: () => seen };
}
const tile = (drink: string) => screen.getByRole("button", { name: new RegExp(`^Tambah ${drink}(,|$)`) });
const order = () => screen.getByRole("region", { name: "Pesanan" });
const dialog = () => screen.getByRole("dialog");

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("says where and for whom, and starts empty with Kirim resting", () => {
  open();
  expect(screen.getByRole("heading", { level: 1, name: "Input cepat" })).toBeTruthy();
  expect(screen.getByText(`Vasuki Room · PIC ${PIC.name} · PT Sinar Jaya (contoh) · 4 orang`)).toBeTruthy();
  expect(within(order()).getByText("Belum ada minuman")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement).disabled).toBe(true);
});

it("adds a guest's drink per tap: the same drink twice is one row of two, hot with gula Normal", () => {
  const { lines } = open();
  fireEvent.click(tile("Café Latte"));
  fireEvent.click(tile("Café Latte"));
  fireEvent.click(tile("Americano"));
  expect(lines()).toMatchObject([{ slug: "cafe-latte", for: "tamu", qty: 2, temperature: "panas", sugar: "Normal" }, { slug: "americano", qty: 1 }]);
  expect(screen.getByRole("button", { name: "Tambah Café Latte, sudah 2" })).toBeTruthy();
  expect(within(order()).getByText("3 minuman · Tamu 3")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Kirim 3 minuman" })).toBeTruthy();
  // The other kind of drinks; a cold-only one starts cold.
  fireEvent.click(screen.getByRole("button", { name: "Non-kopi" }));
  fireEvent.click(tile("Cucumber Ice"));
  expect(lines()[2]).toMatchObject({ slug: "cucumber-ice", temperature: "es", ice: "Normal" });
  expect(within(order()).getByText("Es · gula Normal · es Normal")).toBeTruthy();
});

it("ignores the tap that was still on its way from the screen before", () => {
  const onSend = vi.fn();
  function Host() { const [lines, setLines] = useState<Line[]>([]); return <QuickInput draft={draft} lines={lines} setLines={setLines} people={SAMPLE_PEOPLE} sending={false} problem={null} onSend={onSend} onGuest={vi.fn()} onBack={vi.fn()} />; }
  render(<Host />);
  fireEvent.click(tile("Café Latte"));
  expect(within(order()).getByText("Belum ada minuman")).toBeTruthy();
  rest();
  fireEvent.click(tile("Café Latte"));
  expect(within(order()).getByText("1 minuman · Tamu 1")).toBeTruthy();
});

it("asks who a team member's drink is for, and holds it until someone is picked", () => {
  const { lines } = open();
  fireEvent.click(screen.getByRole("button", { name: "Tim · rapat" }));
  fireEvent.click(tile("Kopi Susu"));
  expect(within(dialog()).getByRole("heading", { name: "Kopi Susu" })).toBeTruthy();
  const name = within(dialog()).getByLabelText("Nama anggota tim");
  // Not in the field: the tablet’s keyboard would cover the names.
  expect(document.activeElement).toBe(within(dialog()).getByRole("heading", { name: "Kopi Susu" }));
  // The PIC is offered first.
  expect(within(dialog()).getAllByRole("button", { name: /\(contoh\)/ })[0].textContent).toBe(`${PIC.name} (PIC)`);
  fireEvent.click(within(dialog()).getByRole("button", { name: "Tambahkan" }));
  expect(within(dialog()).getByRole("alert").textContent).toBe("Pilih orangnya dulu: minuman tim dicatat atas nama orangnya.");
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(name);
  expect(lines()).toHaveLength(0);
  // Typing narrows the list; a typed name alone is not a person.
  fireEvent.change(name, { target: { value: "rina" } });
  expect(within(dialog()).getAllByRole("button", { name: /\(contoh\)/ })).toHaveLength(1);
  fireEvent.click(within(dialog()).getByRole("button", { name: OTHER.name }));
  expect(within(dialog()).getByText("Tidak memotong jatah, tetapi dicatat atas nama orang ini.")).toBeTruthy();
  fireEvent.click(within(dialog()).getByRole("button", { name: "Tambahkan" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(lines()).toMatchObject([{ slug: "kopi-susu", for: "tim", person: { id: OTHER.id, name: OTHER.name }, qty: 1 }]);
  expect(within(order()).getByText(`Tim · rapat · ${OTHER.name}`)).toBeTruthy();
  expect(within(order()).getByText("1 minuman · Tim · rapat 1")).toBeTruthy();
});

it("changes a row: cold shows the ice, the number and the sugar follow, and Hapus removes it", () => {
  const { lines } = open();
  fireEvent.click(tile("Café Latte"));
  fireEvent.click(screen.getByRole("button", { name: "Ubah Café Latte, Tamu" }));
  expect(within(dialog()).queryByRole("group", { name: "Takaran es" })).toBeNull();
  fireEvent.click(within(dialog()).getByRole("button", { name: "Es" }));
  fireEvent.click(within(within(dialog()).getByRole("group", { name: "Takaran es" })).getByRole("button", { name: "Sedikit" }));
  fireEvent.click(within(within(dialog()).getByRole("group", { name: "Gula" })).getByRole("button", { name: "Tanpa" }));
  fireEvent.click(within(within(dialog()).getByRole("group", { name: "Jumlah" })).getByRole("button", { name: "Tambah" }));
  fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan" }));
  expect(lines()).toMatchObject([{ temperature: "es", ice: "Sedikit", sugar: "Tanpa", qty: 2 }]);
  expect(within(order()).getByText("Es · gula Tanpa · es Sedikit")).toBeTruthy();
  // Closing without saving keeps the row as it was.
  fireEvent.click(screen.getByRole("button", { name: "Ubah Café Latte, Tamu" }));
  fireEvent.click(within(dialog()).getByRole("button", { name: "Panas" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(lines()[0].temperature).toBe("es");
  fireEvent.click(screen.getByRole("button", { name: "Ubah Café Latte, Tamu" }));
  fireEvent.click(within(dialog()).getByRole("button", { name: "Hapus" }));
  expect(lines()).toHaveLength(0);
});

it("offers only the temperature a drink comes in", () => {
  open();
  fireEvent.click(tile("Espresso"));
  fireEvent.click(screen.getByRole("button", { name: "Ubah Espresso, Tamu" }));
  expect(within(dialog()).queryByRole("group", { name: "Suhu" })).toBeNull();
});

it("counts a row up and down from the panel; below one the row is gone", () => {
  const { lines } = open();
  fireEvent.click(tile("Americano"));
  const stepper = () => within(order()).getByRole("group", { name: "Jumlah Americano" });
  fireEvent.click(within(stepper()).getByRole("button", { name: "Tambah" }));
  expect(lines()[0].qty).toBe(2);
  fireEvent.click(within(stepper()).getByRole("button", { name: "Kurangi" }));
  fireEvent.click(within(stepper()).getByRole("button", { name: "Kurangi" }));
  expect(lines()).toHaveLength(0);
});

it("sends once: while it is being sent Kirim and the rows rest", () => {
  const first: Line[] = [{ id: "a", slug: "americano", for: "tamu", qty: 2, temperature: "panas", sugar: "Normal", ice: "Normal" }];
  const { onSend, lines } = open({ sending: true, first });
  const kirim = screen.getByRole("button", { name: "Mengirim…" });
  expect(kirim.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(kirim);
  fireEvent.click(kirim);
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.click(tile("Americano"));
  fireEvent.click(within(order()).getByRole("button", { name: "Kurangi" }));
  expect(lines()).toEqual(first);
  expect((screen.getByRole("button", { name: "Serahkan ke tamu" }) as HTMLButtonElement).disabled).toBe(true);
});

it("shows what the server said next to Kirim, and sends again on the next press", () => {
  const first: Line[] = [{ id: "a", slug: "americano", for: "tamu", qty: 1, temperature: "panas", sugar: "Normal", ice: "Normal" }];
  const { onSend } = open({ problem: "Tidak dapat terhubung. Periksa jaringan lalu coba lagi.", first });
  expect(within(order()).getByRole("alert").textContent).toBe("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  fireEvent.click(screen.getByRole("button", { name: "Kirim 1 minuman" }));
  expect(onSend).toHaveBeenCalledTimes(1);
});

it("stops at forty rows, as the server does", () => {
  const first: Line[] = Array.from({ length: MAX_LINES }, (_, index) => ({ id: `l${index}`, slug: "americano", for: "tamu", qty: 1, temperature: "panas", sugar: index % 2 ? "Tanpa" : "Sedikit", ice: "Normal", guestName: `Tamu ${index}` }));
  const { lines } = open({ first });
  fireEvent.click(tile("Kopi Hitam"));
  expect(lines()).toHaveLength(MAX_LINES);
  expect(within(order()).getByText(/Paling banyak 40 baris per kiriman/)).toBeTruthy();
});
