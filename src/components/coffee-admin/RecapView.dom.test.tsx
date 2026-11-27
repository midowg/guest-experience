import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { coffeeAdminApi } from "@/lib/routes";
import { monthQuery, RecapView } from "./RecapView";
import { createSampleServer } from "./sample";
import css from "./coffee-admin.module.css";

/*
 * Rekap on the make-believe server (25 Nov 2026): the numbers on top are the rows below, the
 * filters ask the server again, and the two downloads carry the same filter. Made-up people only.
 */
const NOW = "2026-11-25T03:00:00.000Z";

async function open() {
  const server = createSampleServer();
  const query = monthQuery("2026-11");
  const api = { ...server.api, recap: vi.fn(server.api.recap) };
  render(<div className={css.root}><RecapView api={api} initial={{ query, data: await server.api.recap(query) }} today="2026-11-25" phone={false} active version={0} /></div>);
  return { server, api };
}
const stat = (label: string) => Number(screen.getByText(label, { selector: "section span" }).nextElementSibling?.textContent);
const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("opens on this month from what the page brought, without asking again", async () => {
  const { api } = await open();
  expect(api.recap).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Bulan") as HTMLSelectElement).value).toBe("2026-11");
  expect((screen.getByLabelText("Dari tanggal") as HTMLInputElement).value).toBe("2026-11-01");
  expect((screen.getByLabelText("Sampai tanggal") as HTMLInputElement).value).toBe("2026-11-30");
  expect(screen.getByRole("tab", { name: "Ringkasan" }).getAttribute("aria-selected")).toBe("true");
});

it("counts on top what the Detail rows hold", async () => {
  await open();
  expect(stat("Total minuman")).toBe(stat("Klaim") + stat("Tamu") + stat("Tim · rapat"));
  const detail = screen.getByRole("tab", { name: /^Detail · \d+ baris$/ });
  const count = Number(detail.textContent!.match(/\d+/)![0]);
  fireEvent.click(detail);
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(count);
  const counted = rows.filter(row => /Selesai|Diproses/.test(row.textContent ?? "") && !/Ditolak/.test(row.textContent ?? ""));
  expect(counted).toHaveLength(stat("Total minuman"));
  expect(rows.filter(row => /Ditolak/.test(row.textContent ?? ""))).toHaveLength(stat("Ditolak"));
  // The table's columns are the file's, in the same order (the last one shows as a pill).
  expect(within(screen.getByRole("table")).getAllByRole("columnheader").map(cell => cell.textContent?.replace(/,.*/, ""))).toEqual([
    "Tanggal", "Jam diajukan", "Nomor pesanan", "Jenis", "Nama", "Kelompok", "Jabatan", "BU", "PIC", "Tamu/instansi", "Nama tamu", "Jumlah tamu", "Ruangan",
    "Minuman", "Suhu", "Gula", "Takaran es", "Harga satuan", "Subtotal", "Status", "Catatan tolak", "Diproses oleh", "Jam diproses", "Klaim ke-",
  ]);
});

it("shows each person's quota as dots within one month", async () => {
  await open();
  const people = screen.getByRole("heading", { name: "Per karyawan" }).closest("section")!;
  const maya = within(people).getByRole("rowheader", { name: /Maya Lestari/ }).closest("tr")!;
  expect(maya.textContent).toMatch(/4\/4Habis/);
  expect(within(maya).getByRole("img", { name: "4 dari 4 terpakai" })).toBeTruthy();
  expect(within(people).getByRole("columnheader", { name: "Jatah terpakai" })).toBeTruthy();
});

// F8: one breakdown at a time, chosen with a radio group (27 Nov 2026).
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const shown = () => screen.getByRole("heading", { level: 2, name: /^Per / }).closest("section")!;

it("F8 shows one breakdown at a time, Karyawan first, chosen with a labelled radio group", async () => {
  await open();
  const group = screen.getByRole("radiogroup", { name: "Lihat per" });
  const choices = within(group).getAllByRole("radio");
  expect(choices.map(radio => radio.textContent)).toEqual(["Karyawan", "Minuman", "PIC tamu", "BU", "Kelompok", "Ruangan"]);
  expect(choices.map(radio => radio.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false", "false", "false"]);
  expect(screen.getAllByRole("heading", { level: 2, name: /^Per / })).toHaveLength(1);
  expect(shown().textContent).toMatch(/Jatah terpakai per karyawan · November 2026/);
  expect(screen.queryByRole("columnheader", { name: "Rapat" })).toBeNull();
});

it("F8 moves with the arrow keys, Home and End, one Tab stop, and announces the caption", async () => {
  await open();
  const radios = within(screen.getByRole("radiogroup", { name: "Lihat per" })).getAllByRole("radio") as HTMLElement[];
  expect(radios.map(radio => radio.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  radios[0].focus();
  fireEvent.keyDown(radios[0], { key: "ArrowRight" });
  expect(document.activeElement).toBe(radios[1]);
  expect(radios[1].getAttribute("aria-checked")).toBe("true");
  expect(radios.map(radio => radio.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1]);
  expect(shown().textContent).toMatch(/Minuman paling banyak dibuat/);
  expect(shown().querySelector("[aria-live]")).toBeTruthy();
  fireEvent.keyDown(radios[1], { key: "End" });
  expect(document.activeElement).toBe(radios[5]);
  expect(screen.getByRole("heading", { level: 2, name: "Per ruangan" })).toBeTruthy();
  fireEvent.keyDown(radios[5], { key: "ArrowRight" });
  expect(document.activeElement).toBe(radios[0]);
  fireEvent.keyDown(radios[0], { key: "ArrowLeft" });
  expect(document.activeElement).toBe(radios[5]);
  fireEvent.keyDown(radios[5], { key: "Home" });
  expect(radios[0].getAttribute("aria-checked")).toBe("true");
});

it("F8 remembers the choice over Detail and back", async () => {
  await open();
  choose("PIC tamu");
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  expect(screen.queryByRole("radiogroup")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Ringkasan" }));
  expect(screen.getByRole("radio", { name: "PIC tamu" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("heading", { level: 2, name: "Per PIC tamu" })).toBeTruthy();
});

it("F8 Minuman: ranked bars, count and share, and a Total that is the number on top", async () => {
  await open();
  choose("Minuman");
  const table = within(shown()).getByRole("table");
  expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Minuman", "Grafik", "Jumlah", "Porsi", "Pengeluaran"]);
  const body = within(table).getAllByRole("row").slice(1, -1).map(row => [...row.children].map(cell => cell.textContent));
  const counts = body.map(cells => Number(cells[2]));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  expect(body[0][3]).toMatch(/^\d+%$/);
  const total = within(table).getAllByRole("row").at(-1)!;
  expect(total.textContent).toMatch(new RegExp(`^Total${stat("Total minuman")}100%Rp [0-9.]+$`));
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(stat("Total minuman"));
  // a bar is for the eyes only
  expect(table.querySelectorAll(`.${css.barTrack}[aria-hidden="true"]`).length).toBe(counts.length);
});

it("F8 PIC tamu, BU, Kelompok and Ruangan each add up to a Total row", async () => {
  await open();
  const totals = async (name: string, columns: number) => {
    choose(name);
    const rows = within(shown()).getAllByRole("row").slice(1);
    const cells = rows.map(row => [...row.children].map(cell => cell.textContent ?? ""));
    const total = cells.at(-1)!;
    expect(total[0]).toBe("Total");
    for (let column = 1; column <= columns; column++) {
      const sum = cells.slice(0, -1).reduce((all, row) => all + (Number(row[column]) || 0), 0);
      expect(Number(total[column]) || 0, `${name} column ${column}`).toBe(sum);
    }
    return cells;
  };
  const pics = await totals("PIC tamu", 3);
  expect(pics.length).toBeGreaterThan(2);
  const bus = await totals("BU", 4);
  expect(bus.at(-1)![4]).toBe(String(stat("Total minuman")));
  const groups = await totals("Kelompok", 5);
  expect(groups.slice(0, -1).map(row => row[0])).toEqual(["Karyawan", "Tim GA", "Intern"]);
  expect(shown().textContent).toMatch(/Tamu tidak masuk kelompok mana pun/);
  const rooms = await totals("Ruangan", 5);
  const names = rooms.slice(0, -1).map(row => row[0]);
  expect(names).toEqual(expect.arrayContaining(["Vasuki Room", "CFC Ananta Room"]));
  expect(names.at(-1)).toBe("Tanpa ruangan");
});

it("F8 says so when a view has nothing to show", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Klaim" }));
  await waitFor(() => expect(stat("Tamu")).toBe(0));
  choose("PIC tamu");
  expect(screen.getByText("Tidak ada tamu untuk filter ini.")).toBeTruthy();
  choose("Ruangan");
  expect(screen.getByText("Tidak ada pesanan rapat untuk filter ini.")).toBeTruthy();
  choose("Minuman");
  expect(within(shown()).getAllByRole("row").length).toBeGreaterThan(2);
});

it("F8 truncates a long name with its full name as the title", async () => {
  await open();
  const long = within(shown()).getAllByRole("rowheader").map(cell => cell.firstElementChild as HTMLElement).find(cell => /Wicaksono/.test(cell.textContent ?? ""));
  expect(long?.getAttribute("title")).toBe(long?.textContent);
});

it("asks the server again when a filter changes, and the downloads carry the same filter", async () => {
  const { api } = await open();
  expect(href("Unduh CSV")).toBe(coffeeAdminApi.recapExport("csv", { dari: "2026-11-01", sampai: "2026-11-30" }));
  expect(href("Unduh Excel")).toBe(coffeeAdminApi.recapExport("xlsx", { dari: "2026-11-01", sampai: "2026-11-30" }));
  expect(screen.getByRole("link", { name: "Unduh Excel" }).hasAttribute("download")).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Tamu" }));
  await waitFor(() => expect(api.recap).toHaveBeenLastCalledWith(expect.objectContaining({ dari: "2026-11-01", sampai: "2026-11-30", jenis: "tamu" })));
  await waitFor(() => expect(stat("Klaim")).toBe(0));
  expect(stat("Tamu")).toBeGreaterThan(0);

  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "selesai" } });
  fireEvent.change(screen.getByLabelText("Cari"), { target: { value: "sinar" } });
  await waitFor(() => expect(api.recap).toHaveBeenLastCalledWith(expect.objectContaining({ jenis: "tamu", status: "selesai", q: "sinar" })));
  const filter = { dari: "2026-11-01", sampai: "2026-11-30", jenis: "tamu", status: "selesai", q: "sinar" };
  expect(href("Unduh CSV")).toBe(coffeeAdminApi.recapExport("csv", filter));
  expect(href("Unduh Excel")).toBe(coffeeAdminApi.recapExport("xlsx", filter));

  fireEvent.click(screen.getByRole("button", { name: "Hapus filter" }));
  await waitFor(() => expect(href("Unduh CSV")).toBe(coffeeAdminApi.recapExport("csv", { dari: "2026-11-01", sampai: "2026-11-30" })));
  expect((screen.getByLabelText("Cari") as HTMLInputElement).value).toBe("");
});

it("for a span longer than one month shows the claims as a number only, with a note", async () => {
  const { api } = await open();
  fireEvent.change(screen.getByLabelText("Dari tanggal"), { target: { value: "2026-10-01" } });
  await waitFor(() => expect(api.recap).toHaveBeenLastCalledWith(expect.objectContaining({ dari: "2026-10-01", sampai: "2026-11-30" })));
  const people = screen.getByRole("heading", { name: "Per karyawan" }).closest("section")!;
  await waitFor(() => expect(within(people).getByRole("columnheader", { name: "Klaim" })).toBeTruthy());
  expect(people.textContent).toMatch(/Rentang lebih dari satu bulan: yang tampil jumlah klaim saja/);
  expect(within(people).queryByRole("img")).toBeNull();
  expect(people.textContent).not.toMatch(/Habis/);
  expect(within(people).getByRole("rowheader", { name: /Maya Lestari/ }).closest("tr")!.textContent).toMatch(/TEE5/);
  expect((screen.getByLabelText("Bulan") as HTMLSelectElement).value).toBe("");
  expect(screen.getByRole("option", { name: "Rentang lain" })).toBeTruthy();
});

it("does not ask for a span that ends before it starts, and takes the downloads away", async () => {
  const { api } = await open();
  fireEvent.change(screen.getByLabelText("Sampai tanggal"), { target: { value: "2026-10-15" } });
  expect(screen.getByRole("alert").textContent).toBe("Tanggal akhir tidak boleh sebelum tanggal awal.");
  expect(api.recap).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "Unduh CSV" })).toBeNull();
  expect((screen.getByRole("button", { name: "Unduh CSV" }) as HTMLButtonElement).disabled).toBe(true);
});

it("keeps the old numbers and offers Coba lagi when the server cannot be reached", async () => {
  const { api } = await open();
  const before = stat("Total minuman");
  api.recap.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Klaim" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Rekap belum bisa dimuat\./);
  expect(stat("Total minuman")).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
  await waitFor(() => expect(stat("Tamu")).toBe(0));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("is a list, not a table, on a phone", async () => {
  const server = createSampleServer();
  const query = monthQuery("2026-11");
  render(<div className={css.root}><RecapView api={server.api} initial={{ query, data: await server.api.recap(query) }} today="2026-11-25" phone active version={0} /></div>);
  expect(screen.queryByRole("table")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getAllByRole("listitem").length).toBeGreaterThan(5);
  expect(screen.getByRole("button", { name: /^Filter/ }).getAttribute("aria-haspopup")).toBe("dialog");
});

it("F8 on a phone: the chips on top, the chosen breakdown as cards of at least a name and a value, a Total card where it makes sense", async () => {
  const server = createSampleServer();
  const query = monthQuery("2026-11");
  render(<div className={css.root}><RecapView api={server.api} initial={{ query, data: await server.api.recap(query) }} today="2026-11-25" phone active version={0} /></div>);
  fireEvent.click(screen.getByRole("tab", { name: "Ringkasan" }));
  for (const name of ["Karyawan", "Minuman", "PIC tamu", "BU", "Kelompok", "Ruangan"]) {
    choose(name);
    expect(screen.queryByRole("table")).toBeNull();
    const lines = within(shown()).getAllByRole("listitem");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(line => line.querySelector("strong"))).toBe(true);
    expect(/Total/.test(lines.at(-1)!.textContent ?? "")).toBe(name !== "Karyawan");
  }
});

// Audit B-1: Rekap → Detail offers Batalkan catatan on a record made by hand, and words a cancelled one "Dibatalkan".
it("offers Batalkan catatan on records made by hand only, and shows a cancelled one as Dibatalkan", async () => {
  for (const phone of [false, true]) {
    const server = createSampleServer();
    const manual = server.seedManual();
    const query = monthQuery("2026-11");
    const onCancel = vi.fn();
    const view = (version: number, data: Awaited<ReturnType<typeof server.api.recap>>) =>
      <div className={css.root}><RecapView api={server.api} initial={{ query, data }} today="2026-11-25" phone={phone} active version={version} onCancel={onCancel} /></div>;
    const { rerender } = render(view(0, await server.api.recap(query)));
    fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
    const buttons = screen.getAllByRole("button", { name: /Batalkan catatan/ });
    expect(buttons).toHaveLength(1);
    const line = buttons[0].closest(phone ? "li" : "tr")!;
    expect(line.textContent).toMatch(/Arief Hidayat \(contoh\)/);
    expect(line.textContent).toMatch(/SelesaiDicatat manual/);
    fireEvent.click(buttons[0]);
    expect(onCancel).toHaveBeenCalledWith({ id: manual.id, title: `Klaim · Arief · Kopi Susu · ${manual.no}`, claim: true });

    await server.api.cancelManual(manual.id);
    rerender(view(1, await server.api.recap(query)));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Batalkan catatan/ })).toBeNull());
    const cancelled = screen.getByText("Dibatalkan").closest(phone ? "li" : "tr")!;
    expect(cancelled.textContent).toMatch(/Arief Hidayat \(contoh\)/);
    expect(cancelled.textContent).toMatch(/DibatalkanDicatat manual/);
    cleanup();
  }
});

// Audit F1-16: a tablist holds only tabs, one of them in the Tab order, the arrows move between them.
it("has a tablist of two tabs with one Tab stop and arrow keys", async () => {
  await open();
  const list = screen.getByRole("tablist", { name: "Tampilan rekap" });
  expect([...list.children].map(child => child.getAttribute("role"))).toEqual(["tab", "tab"]);
  const [summary, detail] = within(list).getAllByRole("tab") as HTMLElement[];
  expect([summary.tabIndex, detail.tabIndex]).toEqual([0, -1]);
  summary.focus();
  fireEvent.keyDown(summary, { key: "ArrowRight" });
  expect(detail.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(detail);
  expect([summary.tabIndex, detail.tabIndex]).toEqual([-1, 0]);
  expect(screen.getByRole("table")).toBeTruthy();
  fireEvent.keyDown(detail, { key: "ArrowLeft" });
  expect(summary.getAttribute("aria-selected")).toBe("true");
});

// Audit F1-13: reading the same span again (an order changed) is quiet; only another filter dims the old numbers.
it("does not dim the numbers when the same span is read again, only while another filter loads", async () => {
  const server = createSampleServer();
  const query = monthQuery("2026-11");
  const data = await server.api.recap(query);
  let release: () => void = () => undefined;
  const recap = vi.fn(async (asked: typeof query) => { await new Promise<void>(resolve => { release = resolve; }); return server.api.recap(asked); });
  const api = { ...server.api, recap };
  const view = (version: number) => <div className={css.root}><RecapView api={api} initial={{ query, data }} today="2026-11-25" phone={false} active version={version} /></div>;
  const { rerender } = render(view(0));
  const numbers = () => screen.getByRole("region", { name: /^Angka/ }).parentElement!;
  rerender(view(1));
  await waitFor(() => expect(recap).toHaveBeenCalledTimes(1));
  expect(numbers().getAttribute("aria-busy")).toBe("true");
  expect(numbers().className).not.toContain(css.stale);
  release();
  await waitFor(() => expect(numbers().getAttribute("aria-busy")).toBe("false"));
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ditolak" } });
  await waitFor(() => expect(recap).toHaveBeenCalledTimes(2));
  expect(numbers().className).toContain(css.stale);
  release();
  await waitFor(() => expect(numbers().className).not.toContain(css.stale));
});

// Audit F1-21: the name is the row's header, and a drink processed on another day says which day.
it("marks the name as the row's header and dates a processing that fell on another day", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(within(rows[0]).getByRole("rowheader").textContent).toMatch(/\(contoh\)/);
  const cells = (row: HTMLElement) => [...row.children].map(cell => cell.textContent);
  expect(rows.every(row => /^(–|\d{2}\.\d{2}|\d{2}\/\d{2}\/\d{4} \d{2}\.\d{2})$/.test(cells(row)[22] ?? ""))).toBe(true);
  // The sample's meeting of five days ago was processed ten minutes later, past midnight UTC but the same WIB day or the next.
  const dated = rows.filter(row => /^\d{2}\/\d{2}\/\d{4} /.test(cells(row)[22] ?? ""));
  for (const row of dated) expect(cells(row)[22]!.slice(0, 10)).not.toBe(cells(row)[0]);
  // "Nama tamu": the guest's own name on the cups of that line, a dash everywhere else.
  const head = within(screen.getByRole("table")).getAllByRole("columnheader").map(cell => cell.textContent);
  const at = head.indexOf("Nama tamu");
  expect(at).toBe(10);
  const names = rows.map(row => cells(row)[at]);
  expect(names.filter(name => name === "Budi (contoh)")).toHaveLength(2);
  expect(names.every(name => name === "–" || name === "Budi (contoh)")).toBe(true);
});

// F6: Suhu, Gula and Takaran es are empty for a drink that was asked nothing.
it("F6 leaves the option cells of the Detail table empty for a drink ordered without options", async () => {
  const server = createSampleServer();
  const month = new Date(NOW).toISOString().slice(0, 7);
  await server.api.manual({ kind: "klaim", employeeId: "p-arief", date: `${month}-25`, time: "09:00", slug: "espresso", key: "eeeeeeee-eeee-4eee-8eee-000000000001" });
  const query = monthQuery("2026-11");
  render(<div className={css.root}><RecapView api={server.api} initial={{ query, data: await server.api.recap(query) }} today="2026-11-25" phone={false} active version={0} /></div>);
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  const head = screen.getAllByRole("columnheader").map(cell => cell.textContent?.replace(/, urutkan.*/, ""));
  const row = screen.getAllByRole("row").find(item => /Arief/.test(item.textContent ?? "") && /Espresso/.test(item.textContent ?? "") && /Dicatat manual/.test(item.textContent ?? ""))!;
  const cells = [...row.querySelectorAll("th, td")].map(cell => cell.textContent);
  expect([cells[head.indexOf("Minuman")], cells[head.indexOf("Suhu")], cells[head.indexOf("Gula")], cells[head.indexOf("Takaran es")]]).toEqual(["Espresso", "–", "–", "–"]);
});
