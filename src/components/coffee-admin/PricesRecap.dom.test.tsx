import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { formatRupiah } from "@/lib/coffee/money";
import { monthQuery, RecapView } from "./RecapView";
import { createSampleServer, type SampleMenu } from "./sample";
import css from "./coffee-admin.module.css";

/*
 * F9 (27 Nov 2026), Rekap: the Pengeluaran card, the two money columns of Detail, and the
 * Pengeluaran column of the six breakdowns, each with a Total that agrees with the card.
 * Made-up people only.
 */
const NOW = "2026-11-25T03:00:00.000Z";

async function open(more: { phone?: boolean; menu?: SampleMenu } = {}) {
  const server = createSampleServer(() => Date.parse(NOW), { menu: more.menu });
  const query = monthQuery("2026-11");
  const data = await server.api.recap(query);
  render(<div className={css.root}><RecapView api={server.api} initial={{ query, data }} today="2026-11-25" phone={!!more.phone} active version={0} /></div>);
  return { server, data };
}
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const shown = () => screen.getByRole("heading", { level: 2, name: /^Per / }).closest("section")!;
const card = () => screen.getByText("Pengeluaran", { selector: "section span" }).parentElement!;
const rupiah = (text: string | null | undefined) => Number((text ?? "").replace(/[^0-9]/g, ""));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("shows Pengeluaran as a number card beside the others, saying which orders it counts", async () => {
  const { data } = await open();
  const money = card();
  expect(within(money).getByText(formatRupiah(data.summary.spend.total))).toBeTruthy();
  expect(data.summary.spend.total).toBeGreaterThan(0);
  expect(within(money).getByText("dari pesanan Selesai diproses saja")).toBeTruthy();
  expect(screen.getByRole("region", { name: /^Angka/ }).querySelectorAll(`.${css.stat}`)).toHaveLength(6);
});

it("counts only Selesai orders, so a waiting or refused one never adds to it", async () => {
  const { data } = await open();
  const spent = data.rows.filter(row => row.status === "selesai").reduce((sum, row) => sum + (row.unitPrice ?? 0), 0);
  expect(data.summary.spend.total).toBe(spent);
  expect(data.rows.some(row => row.status === "diproses" && row.unitPrice != null)).toBe(true);
  expect(data.rows.some(row => row.status === "ditolak" && row.unitPrice != null)).toBe(true);
});

it("says how many done drinks have no price, as a link to Menu", async () => {
  const { data } = await open();
  const n = data.summary.spend.unpriced;
  expect(n).toBeGreaterThan(0);
  const link = within(card()).getByRole("link", { name: `${n} minuman belum berharga, tidak terhitung` });
  expect(link.getAttribute("href")).toBe("/admin/coffee/menu");
});

it("adds two columns to Detail: the unit price of any drink, the subtotal only of a Selesai one", async () => {
  const { data } = await open();
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  const table = screen.getByRole("table");
  const head = within(table).getAllByRole("columnheader").map(cell => cell.textContent);
  const at = head.indexOf("Harga satuan");
  expect(head.slice(at - 1, at + 3)).toEqual(["Takaran es", "Harga satuan", "Subtotal", "Status"]);
  const rows = within(table).getAllByRole("row").slice(1);
  const cell = (row: HTMLElement, index: number) => row.children[index].textContent;
  // Rows in the table are the first hundred, newest first: the same order as the data.
  const done = rows.filter(row => /Selesai/.test(cell(row, at + 2) ?? ""));
  expect(done.length).toBeGreaterThan(0);
  for (const row of done) expect(cell(row, at + 1)).toBe(cell(row, at));
  const waiting = rows.find(row => /Diproses/.test(cell(row, at + 2) ?? "") && cell(row, at) !== "–");
  expect(waiting).toBeTruthy();
  expect(cell(waiting!, at + 1)).toBe("–");
  expect(rows.some(row => cell(row, at) === "–" && /Selesai/.test(cell(row, at + 2) ?? ""))).toBe(true);
  // What the Subtotal column adds up to is the card.
  const total = rows.reduce((sum, row) => sum + rupiah(cell(row, at + 1) === "–" ? "" : cell(row, at + 1)), 0);
  expect(total).toBe(data.summary.spend.total);
  expect(within(table).getAllByRole("columnheader")[at].className).toContain(css.num);
});

it("ends each of the six breakdowns in a Pengeluaran column; the Total adds the column up", async () => {
  const { data } = await open();
  for (const view of ["Karyawan", "Minuman", "PIC tamu", "BU", "Kelompok", "Ruangan"]) {
    choose(view);
    const table = within(shown()).getByRole("table");
    const heads = within(table).getAllByRole("columnheader");
    expect(heads.at(-1)?.textContent).toBe("Pengeluaran");
    expect(heads.at(-1)?.className).toContain(css.num);
    const body = within(table).getAllByRole("row").slice(1).filter(row => !row.closest("tfoot"));
    const sum = body.reduce((all, row) => all + rupiah(row.lastElementChild?.textContent === "–" ? "" : row.lastElementChild?.textContent), 0);
    const foot = table.querySelector("tfoot tr");
    if (foot) expect(rupiah(foot.lastElementChild?.textContent)).toBe(sum);
    if (view === "Minuman" || view === "BU") expect(sum).toBe(data.summary.spend.total);
    // Guests are the PIC's, not any group's: those views never exceed the card.
    expect(sum).toBeLessThanOrEqual(data.summary.spend.total);
  }
});

it("keeps Karyawan to a person's own drinks and says where guests are counted", async () => {
  const { data } = await open();
  expect(shown().textContent).toMatch(/minuman tamu dihitung di PIC tamu, Ruangan, dan BU/);
  const own = data.summary.people.reduce((sum, entry) => sum + entry.spend, 0);
  const guests = data.summary.pics.reduce((sum, entry) => sum + entry.spend, 0);
  expect(own + guests).toBe(data.summary.spend.total);
});

it("writes a line without spending as a dash, never 'Rp 0'", async () => {
  await open();
  const table = within(shown()).getByRole("table");
  const last = within(table).getAllByRole("row").slice(1).map(row => row.lastElementChild?.textContent);
  expect(last.some(text => text === "–")).toBe(true);
  expect(last.some(text => text === formatRupiah(0))).toBe(false);
});

it("on a phone each card carries its amount under the number, and the Total too", async () => {
  const { data } = await open({ phone: true });
  choose("BU");
  const list = within(shown()).getByRole("list");
  const items = within(list).getAllByRole("listitem");
  const total = items.at(-1)!;
  expect(total.textContent).toContain("Total");
  expect(total.querySelector(`.${css.sideMoney}`)?.textContent).toBe(formatRupiah(data.summary.spend.total));
  expect(items.filter(item => item.querySelector(`.${css.sideMoney}`)).length).toBeGreaterThan(1);
  choose("Minuman");
  expect(within(shown()).getAllByRole("listitem").at(-1)!.querySelector(`.${css.sideMoney}`)?.textContent).toBe(formatRupiah(data.summary.spend.total));
});

it("on a phone Detail shows the unit price on the drink's card", async () => {
  const { data } = await open({ phone: true });
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  const priced = data.rows.filter(row => row.unitPrice != null).length;
  expect(screen.getAllByText(/^Rp [0-9.]+$/, { selector: "li span" }).length).toBe(Math.min(priced, 100));
});

it("before migration 202612050001: the card and every money column read a dash and name the migration", async () => {
  await open({ menu: "prices-waiting" });
  const money = card();
  expect(within(money).getByText("–")).toBeTruthy();
  expect(within(money).getByText("Menunggu migrasi 202612050001_coffee_price.sql")).toBeTruthy();
  expect(within(money).queryByRole("link")).toBeNull();
  for (const view of ["Minuman", "BU", "Ruangan"]) {
    choose(view);
    const table = within(shown()).getByRole("table");
    const column = within(table).getAllByRole("row").slice(1).map(row => row.lastElementChild?.textContent);
    expect(column.every(text => text === "–")).toBe(true);
  }
  fireEvent.click(screen.getByRole("tab", { name: /^Detail/ }));
  const table = screen.getByRole("table");
  const at = within(table).getAllByRole("columnheader").map(cell => cell.textContent).indexOf("Harga satuan");
  expect(within(table).getAllByRole("row").slice(1).every(row => row.children[at].textContent === "–" && row.children[at + 1].textContent === "–")).toBe(true);
});
