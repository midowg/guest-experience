import { expect, it } from "vitest";
import type { MeetingOrder } from "@/lib/coffee/types";
import { HOLD_COOKIE, parseHold } from "./hold";
import { canAddTo, countLabel, counts, doneLine, lineTag, matches, nextDraft, printOf, roomStatuses, rootOf, sameSending, statusOf, toBody, type Draft, type Line } from "./model";

/*
 * What the tablet works out before anything is sent (audit F3: model.ts had no test of its own),
 * and what it keeps for a reload in guest mode (hold.ts). Made-up people only.
 */
const ROOMS = [{ name: "CFC Ananta Room", spot: "ananta" }, { name: "Vasuki Room", spot: "vasuki" }];
const order = (id: string, more: Partial<MeetingOrder> = {}): MeetingOrder => ({
  id, no: "T-0113", number: 113, round: 1, parentId: null, room: "Vasuki Room", spot: "vasuki", guest: "PT Sinar (contoh)", guestCount: 4, status: "diproses", rejectNote: "",
  orderedAt: "2026-11-26T02:00:00.000Z", items: [], sentBy: "Bagas (contoh)", manual: false, pic: { id: "p1", name: "Dimas (contoh)" }, processedLabel: "", processedAt: null, ...more,
});
const draft: Draft = { room: "Vasuki Room", spot: "vasuki", pic: { id: "p1", name: "Dimas (contoh)" }, guest: "PT Sinar (contoh)", guestCount: 4 };
const line = (more: Partial<Line> = {}): Line => ({ id: "l1", slug: "americano", for: "tamu", qty: 1, temperature: "panas", sugar: "Normal", ice: "Normal", ...more });

it("Tambah lagi joins the first sending while it is open, and starts a replacement otherwise", () => {
  const first = order("a");
  expect(nextDraft(first, [first])).toEqual({ ...draft, parent: { id: "a", no: "T-0113" } });
  expect(canAddTo(order("a", { status: "selesai" }), [order("a", { status: "selesai" })])).toBe(true);
  // Refused or cancelled: the same room and PIC, without a parent.
  for (const status of ["ditolak", "batal"] as const) {
    const closed = order("a", { status });
    expect(nextDraft(closed, [closed])).toEqual(draft);
    expect(canAddTo(closed, [closed])).toBe(false);
  }
  // A later round follows its first sending, not its own status.
  const done = order("a", { status: "selesai" }), second = order("b", { parentId: "a", round: 2, no: "T-0113-2", status: "ditolak", guest: "", guestCount: null });
  expect(rootOf(second, [second, done])).toBe(done);
  expect(nextDraft(second, [second, done])).toEqual({ ...draft, parent: { id: "a", no: "T-0113" } });
  // The first sending is not on today's list (yesterday's meeting): a new order with what this one says.
  expect(nextDraft(second, [second])).toEqual({ room: "Vasuki Room", spot: "vasuki", pic: { id: "p1", name: "Dimas (contoh)" }, guest: undefined, guestCount: undefined });
  // F3-12: a record the pengelola made by hand is never added to.
  const manual = order("m", { manual: true, status: "selesai" });
  expect(canAddTo(manual, [manual])).toBe(false);
  // A PIC who is no longer an employee has no id: the form asks for another.
  expect(nextDraft(order("x", { status: "ditolak", pic: { id: null, name: "Sudah Keluar (contoh)" } }), []).pic).toEqual({ id: "", name: "Sudah Keluar (contoh)" });
});

it("gives each room one status: waiting wins, then refused, then done", () => {
  expect(statusOf([])).toBeUndefined();
  expect(statusOf([order("a", { status: "selesai" }), order("b", { status: "ditolak" })])).toBe("ditolak");
  expect(statusOf([order("a", { status: "selesai" }), order("b", { status: "ditolak" }), order("c")])).toBe("diproses");
  expect(statusOf([order("a", { status: "batal" })])).toBeUndefined();
  expect(roomStatuses([order("a", { status: "selesai" }), order("b", { spot: "ananta", room: "CFC Ananta Room" }), order("c", { spot: null, room: "Lobi" })], ROOMS)).toEqual({ vasuki: "selesai", ananta: "diproses" });
});

it("sends what the server reads: ice only for Es, a person only for the team, a name only for a guest", () => {
  const body = toBody({ ...draft, parent: { id: "a", no: "T-0113" } }, [
    line({ temperature: "panas", ice: "Ekstra", guestName: "  Budi " }),
    line({ id: "l2", for: "tim", person: { id: "p2", name: "Rina (contoh)" }, guestName: "bukan tamu", temperature: "es", ice: "Sedikit", qty: 3 }),
    line({ id: "l3", guestName: "x".repeat(60) }),
  ], "kunci");
  expect(body).toMatchObject({ room: "Vasuki Room", picId: "p1", guest: "PT Sinar (contoh)", guestCount: 4, parentId: "a", key: "kunci" });
  expect(body.items).toEqual([
    { for: "tamu", personId: undefined, guestName: "Budi", slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 1 },
    { for: "tim", personId: "p2", guestName: undefined, slug: "americano", temperature: "es", sugar: "Normal", ice: "Sedikit", qty: 3 },
    { for: "tamu", personId: undefined, guestName: "x".repeat(40), slug: "americano", temperature: "panas", sugar: "Normal", ice: "Normal", qty: 1 },
  ]);
});

it("F3-02 ties a sending's key to its exact contents", () => {
  const lines = [line()];
  expect(printOf(draft, lines)).toBe(printOf({ ...draft }, [line({ id: "another-id" })]));
  expect(printOf(draft, lines)).not.toContain("kunci");
  for (const changed of [printOf(draft, [line({ qty: 2 })]), printOf(draft, [line(), line({ id: "l2", slug: "kopi-susu" })]), printOf({ ...draft, room: "Lobi" }, lines),
    printOf({ ...draft, pic: { id: "p9", name: "Lain" } }, lines), printOf({ ...draft, parent: { id: "a", no: "T-0113" } }, lines), printOf(draft, [line({ guestName: "Budi" })]), printOf(draft, [line({ sugar: "Tanpa" })])]) {
    expect(changed).not.toBe(printOf(draft, lines));
  }
});

it("F3-02 recognises the order a sending became, and nothing else", () => {
  const body = toBody(draft, [line({ qty: 2 }), line({ id: "l2", for: "tim", person: { id: "p2", name: "Rina (contoh)" }, slug: "kopi-susu" })], "k");
  const items = [
    { id: "i1", for: "tamu" as const, qty: 2, slug: "americano", temperature: "panas" as const, sugar: "Normal" as const, ice: "Normal" as const, person: null },
    { id: "i2", for: "tim" as const, qty: 1, slug: "kopi-susu", temperature: "panas" as const, sugar: "Normal" as const, ice: "Normal" as const, person: { id: "p2", name: "Rina (contoh)", group: "karyawan" as const, position: "", bu: "" } },
  ];
  expect(sameSending(order("a", { items }), body)).toBe(true);
  expect(sameSending(order("a", { items: [items[0]] }), body)).toBe(false);
  expect(sameSending(order("a", { items: [{ ...items[0], qty: 3 }, items[1]] }), body)).toBe(false);
  expect(sameSending(order("a", { items, room: "CFC Ananta Room" }), body)).toBe(false);
  expect(sameSending(order("a", { items, pic: { id: "p7", name: "Lain" } }), body)).toBe(false);
  expect(sameSending(order("a", { items, parentId: "z" }), body)).toBe(false);
  // A next round is told by its first sending, whatever room the body carried.
  expect(sameSending(order("b", { items, parentId: "a", round: 2 }), { ...body, parentId: "a", room: "apa saja" })).toBe(true);
});

it("counts and words the drinks", () => {
  const items = [{ for: "tamu" as const, qty: 5 }, { for: "tim" as const, qty: 1 }];
  expect(counts(items)).toEqual({ total: 6, tamu: 5, tim: 1 });
  expect(countLabel(items)).toBe("6 minuman · Tamu 5 · Tim · rapat 1");
  expect(countLabel([{ for: "tamu", qty: 2 }])).toBe("2 minuman · Tamu 2");
  expect(countLabel([])).toBe("0 minuman");
  expect(lineTag("tamu")).toBe("Tamu");
  expect(lineTag("tamu", "Budi")).toBe("Tamu · Budi");
  expect(lineTag("tim", "Rina")).toBe("Tim · rapat · Rina");
  expect(doneLine(order("a"))).toBe("Menunggu pengelola");
  expect(doneLine(order("a", { status: "selesai", processedLabel: "Dewi", processedAt: "2026-11-26T02:14:00.000Z" }))).toBe("Selesai diproses oleh Dewi · 09.14");
  expect(doneLine(order("a", { status: "ditolak" }))).toBe("Ditolak oleh pengelola");
  expect(matches({ id: "p", name: "Rina Putri (contoh)", position: "Finance Staff", bu: "WNS" }, " finance ")).toBe(true);
  expect(matches({ id: "p", name: "Rina Putri (contoh)", position: "Finance Staff", bu: "WNS" }, "tee")).toBe(false);
});

it("F3-01 reads back what was kept for a reload as untrusted text", () => {
  const kept = JSON.stringify({
    draft: { ...draft, parent: { id: "a", no: "T-0113" } },
    lines: [line({ qty: 3 }), line({ id: "l2", for: "tim", person: { id: "p2", name: "Rina (contoh)" } }), { slug: "bukan-minuman", for: "tamu", qty: 1 }, { ...line({ id: "l3" }), qty: 999, sugar: "Manis sekali", temperature: "beku", guestName: "y".repeat(90) }, "sampah"],
    book: { open: true, picks: [{ id: "x1", slug: "cucumber-ice", temperature: "panas", sugar: "Sedikit", ice: "Ekstra", name: "Budi" }, { slug: "tidak-ada" }] },
  });
  const hold = parseHold(kept)!;
  expect(hold.draft).toEqual({ ...draft, parent: { id: "a", no: "T-0113" } });
  expect(hold.lines.map(item => [item.slug, item.for, item.qty, item.sugar, item.temperature, item.person?.id, item.guestName?.length])).toEqual([
    ["americano", "tamu", 3, "Normal", "panas", undefined, undefined], ["americano", "tim", 1, "Normal", "panas", "p2", undefined], ["americano", "tamu", 1, "Normal", "panas", undefined, 40],
  ]);
  // Cucumber Ice only comes iced: a hot one is put right.
  expect(hold.book).toEqual({ open: true, picks: [{ id: "x1", slug: "cucumber-ice", temperature: "es", sugar: "Sedikit", ice: "Ekstra", name: "Budi" }] });
  for (const bad of [null, "", "{", "[]", "42", JSON.stringify({ draft: { room: "", pic: { id: "p", name: "n" } } }), JSON.stringify({ draft: { room: "x" } }), JSON.stringify({ lines: [] })]) expect(parseHold(bad), String(bad)).toBeNull();
  expect(HOLD_COOKIE).toBe("coffee_ga_tamu");
});
