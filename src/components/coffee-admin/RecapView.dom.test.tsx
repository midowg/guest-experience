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
    "Tanggal", "Jam diajukan", "Nomor pesanan", "Jenis", "Nama", "Kelompok", "Jabatan", "BU", "PIC", "Tamu/instansi", "Jumlah tamu", "Ruangan",
    "Minuman", "Suhu", "Gula", "Takaran es", "Status", "Catatan tolak", "Diproses oleh", "Jam diproses", "Klaim ke-",
  ]);
});

it("shows each person's quota as dots within one month", async () => {
  await open();
  const people = screen.getByRole("heading", { name: "Per orang" }).parentElement!;
  const maya = within(people).getByRole("rowheader", { name: /Maya Lestari/ }).closest("tr")!;
  expect(maya.textContent).toMatch(/4\/4Habis/);
  expect(within(maya).getByRole("img", { name: "4 dari 4 terpakai" })).toBeTruthy();
  expect(within(people).getByRole("columnheader", { name: "Jatah terpakai" })).toBeTruthy();
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
  const people = screen.getByRole("heading", { name: "Per orang" }).parentElement!;
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
