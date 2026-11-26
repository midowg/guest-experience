import { inflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recapQuerySchema } from "@/lib/coffee/schemas";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* Rekap and its files against the in-memory stand-in (fake-db.ts). Made-up people. */
let db = fakeDb();
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));

const { recap, recapFiles, recapRows } = await import("./recap");
const { cancelManual, recordManual } = await import("./queue");
const key = (value: number) => `cccccccc-cccc-4ccc-8ccc-${String(value).padStart(12, "0")}`;
const november = recapQuerySchema.parse({ dari: "2026-11-01", sampai: "2026-11-30" });
const drink = { slug: "cafe-latte", temperature: "es", sugar: "Sedikit", ice: "Ekstra" };
let n = 0;
const claim = async (employee: string, at: string) => (await db.client.rpc("coffee_submit_claim", { p_employee: employee, p_item: drink, p_at: at, p_manual: false, p_actor: employee, p_actor_label: "Contoh", p_key: key(++n) })).data as string;

// November (WIB) holds K-418, K-419 (refused), K-420 and the meeting T-0113; K-421 is 31 Oct 23.59 WIB, K-422 is 1 Dec 00.00 WIB.
beforeEach(async () => {
  db = fakeDb(); seedPeople(db); n = 0;
  db.state.now = new Date("2026-12-01T03:00:00Z");
  await claim(PEOPLE.rina, "2026-11-03T02:00:00.000Z");
  const refused = await claim(PEOPLE.rina, "2026-11-10T02:00:00.000Z");
  await claim(PEOPLE.rina, "2026-11-20T02:00:00.000Z");
  await claim(PEOPLE.fajar, "2026-10-31T16:59:00.000Z");
  await claim(PEOPLE.fajar, "2026-11-30T17:00:00.000Z");
  Object.assign(db.rows("coffee_orders").find(row => row.id === refused)!, { status: "ditolak", reject_note: "=SUM(A1) habis", processed_by: PEOPLE.dewi, processed_label: "Dewi", processed_at: "2026-11-10T02:30:00.000Z" });
  await db.client.rpc("coffee_submit_meeting", {
    p_order: { pic_id: PEOPLE.dewi, room: "Vasuki Room", room_spot: "vasuki", guest: "Contoh PT Sinar", guest_count: 5, actor_id: PEOPLE.bagas, actor_label: "Bagas", ordered_at: "2026-11-12T03:00:00.000Z" },
    p_items: [{ for: "tamu", slug: "kopi-susu", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 3, guest_name: "Budi" }, { for: "tim", person_id: PEOPLE.fajar, slug: "americano", temperature: "panas", sugar: "Tanpa", ice: "Normal", qty: 1 }], p_key: key(100),
  });
});

describe("Rekap", () => {
  it("gives the span's drinks in WIB days, newest first, one row per drink", async () => {
    const rows = await recapRows(november);
    expect(rows.map(row => [row.no, row.kind, row.status])).toEqual([
      ["K-420", "klaim", "diproses"], ["T-0113", "tamu", "diproses"], ["T-0113", "tamu", "diproses"], ["T-0113", "tamu", "diproses"], ["T-0113", "tim", "diproses"],
      ["K-419", "klaim", "ditolak"], ["K-418", "klaim", "diproses"],
    ]);
    expect((await recapRows(recapQuerySchema.parse({ dari: "2026-12-01", sampai: "2026-12-31" }))).map(row => row.no)).toEqual(["K-422"]);
    expect((await recapRows(recapQuerySchema.parse({ dari: "2026-10-31", sampai: "2026-10-31" }))).map(row => row.no)).toEqual(["K-421"]);
  });

  it("numbers claims from the first of the month even when the span starts later, and never a refused one", async () => {
    const rows = await recapRows(recapQuerySchema.parse({ dari: "2026-11-15", sampai: "2026-11-30" }));
    expect(rows.map(row => [row.no, row.claimNo])).toEqual([["K-420", 2]]);
    expect((await recapRows(november)).filter(row => row.kind === "klaim").map(row => [row.no, row.claimNo])).toEqual([["K-420", 2], ["K-419", undefined], ["K-418", 1]]);
  });

  it("filters by kind, status and a word", async () => {
    expect(await recapRows({ ...november, jenis: "tamu" })).toHaveLength(3);
    expect(await recapRows({ ...november, status: "ditolak" })).toHaveLength(1);
    expect((await recapRows({ ...november, q: "fajar" })).map(row => row.kind)).toEqual(["tim"]);
  });

  it("summarises what it lists: the totals equal the rows that count", async () => {
    const { rows, summary, title } = await recap(november);
    expect(title).toBe("November 2026");
    expect(summary).toMatchObject({ total: 6, klaim: 2, tamu: 3, tim: 1, refused: 1, meetings: 1 });
    expect(summary.total).toBe(rows.filter(row => row.status !== "ditolak" && row.status !== "batal").length);
    expect(summary.pics).toEqual([{ pic: "Contoh Dewi Lestari", meetings: 1, guests: 5, drinks: 3 }]);
    expect(summary.people.find(entry => entry.person.id === PEOPLE.rina)).toMatchObject({ used: 2, quota: 4, refused: 1 });
    expect(summary.people.find(entry => entry.person.id === PEOPLE.bagas)).toMatchObject({ used: 0, quota: 2 });
    expect(summary.bus.find(bu => bu.bu === "TEE")).toMatchObject({ tamu: 3, total: 3 });
  });
});

/** The text of one part of an .xlsx (a zip): found by its local file header, then inflated. */
function part(file: Buffer, name: string): string {
  const at = file.indexOf(Buffer.from(name));
  const size = file.readUInt32LE(at - 12);
  const start = at + file.readUInt16LE(at - 4) + file.readUInt16LE(at - 2);
  return inflateRawSync(file.subarray(start, start + size)).toString("utf8");
}

describe("Rekap's files", () => {
  it("writes a CSV with the table's cells, safe from formulas", async () => {
    const { csv } = await recapFiles(november);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("﻿\"Tanggal\",\"Jam diajukan\",\"Nomor pesanan\",\"Jenis\",\"Nama\",\"Kelompok\",\"Jabatan\",\"BU\",\"PIC\",\"Tamu/instansi\",\"Nama tamu\",\"Jumlah tamu\",\"Ruangan\",\"Minuman\",\"Suhu\",\"Gula\",\"Takaran es\",\"Status\",\"Catatan tolak\",\"Diproses oleh\",\"Jam diproses\",\"Klaim ke-\",\"Dicatat manual\"");
    expect(lines).toHaveLength(1 + 7 + 1);
    expect(lines[1]).toBe("\"20/11/2026\",\"09:00\",\"K-420\",\"Klaim\",\"Contoh Rina Putri\",\"Karyawan\",\"Contoh karyawan\",\"WNS\",\"\",\"\",\"\",\"\",\"\",\"Café Latte\",\"Es\",\"Sedikit\",\"Ekstra\",\"Diproses\",\"\",\"\",\"\",\"2\",\"\"");
    expect(lines[2]).toContain("\"Tamu\",\"Contoh Dewi Lestari\",\"Tamu\",\"Contoh karyawan\",\"TEE\",\"Contoh Dewi Lestari\",\"Contoh PT Sinar\",\"Budi\",\"5\",\"Vasuki Room\",\"Kopi Susu\"");
    // The team member's drink of the same meeting has no guest name.
    expect(lines.find(line => line.includes("\"Tim · rapat\""))).toContain("\"Contoh Dewi Lestari\",\"\",\"\",\"\",\"Vasuki Room\"");
    expect(lines[6]).toContain("\"Ditolak\",\"'=SUM(A1) habis\",\"Dewi\",\"09:30\",\"\",\"\"");
  });

  it("writes an .xlsx with a Detail and a Ringkasan sheet holding the same rows", async () => {
    const { xlsx } = await recapFiles(november);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    expect(part(xlsx, "xl/workbook.xml")).toMatch(/name="Detail".*name="Ringkasan"/);
    const detail = part(xlsx, "xl/worksheets/sheet1.xml");
    expect(detail.match(/<row /g)).toHaveLength(8);
    expect(detail).toContain("Nomor pesanan");
    expect(detail).toContain("Nama tamu");
    expect(detail.match(/>Budi</g)).toHaveLength(3);
    expect(detail).toContain("=SUM(A1) habis");
    expect(detail).not.toContain("<f>");
    const summary = part(xlsx, "xl/worksheets/sheet2.xml");
    expect(summary).toContain("Rekap Werkudara Coffee · November 2026");
    expect(summary).toContain("Per PIC");
  });
});

it("answers 503 with the migration's name before it runs", async () => {
  db.state.migrated = false;
  await expect(recap(november)).rejects.toMatchObject({ status: 503, message: "Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." });
  await expect(recapFiles(november)).rejects.toMatchObject({ status: 503 });
});

// Audit B-1: a record made by hand that was cancelled stays in Rekap, worded "Dibatalkan", and counts nowhere.
it("keeps a cancelled record made by hand as Dibatalkan, out of the totals and of the person's quota", async () => {
  const dewi = { employeeId: PEOPLE.dewi, label: "Dewi" };
  const now = new Date("2026-12-01T03:00:00Z");
  const { manualSchema } = await import("@/lib/coffee/schemas");
  const { order } = await recordManual(manualSchema.parse({ kind: "klaim", employeeId: PEOPLE.bagas, date: "2026-11-21", time: "10:00", slug: "cafe-latte", temperature: "panas", sugar: "Normal", key: key(200) }), dewi, now);
  const before = await recap(november);
  expect(before.summary.klaim).toBe(3);
  expect(before.summary.people.find(entry => entry.person.id === PEOPLE.bagas)).toMatchObject({ used: 1 });
  await cancelManual(order.id, { employeeId: null, label: "Super admin" }, now);
  const after = await recap(november);
  expect(after.rows.find(row => row.orderId === order.id)).toMatchObject({ status: "batal", manual: true, doneBy: "Super admin", name: "Contoh Bagas Saputra" });
  expect(after.rows.find(row => row.orderId === order.id)?.claimNo).toBeUndefined();
  expect(after.summary.klaim).toBe(2);
  expect(after.summary.people.find(entry => entry.person.id === PEOPLE.bagas)).toMatchObject({ used: 0 });
  const { csv } = await recapFiles(november);
  const line = csv.split("\r\n").find(text => text.includes("K-423"))!;
  expect(line).toContain("Dibatalkan");
  expect(line).toContain('"Dibatalkan","","Super admin","10:00","","Ya"');
});
